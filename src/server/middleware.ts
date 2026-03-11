import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { SessionStore } from "./session-store.js";
import { FileManager } from "./file-manager.js";
import { GenerationManager } from "./generation-manager.js";
import { ImageHandler } from "./image-handler.js";
import { detectProvider, configureProvider } from "./provider-detector.js";
import type { OpencodeClient } from "@opencode-ai/sdk";

interface Route {
  method: string;
  pattern: RegExp;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>
  ) => Promise<void> | void;
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function createMiddleware(projectRoot: string) {
  const sessionStore = new SessionStore(projectRoot);
  const fileManager = new FileManager(projectRoot);
  const generationManager = new GenerationManager(projectRoot);
  const imageHandler = new ImageHandler(projectRoot);

  // Store client ref and provider status
  let opencodeClient: OpencodeClient | null = null;
  let providerStatus = { configured: false, provider: null as string | null, model: null as string | null };

  // File change SSE clients
  const fileChangeListeners = new Set<(data: string) => void>();

  // Called by preset.ts once OpenCode is ready
  function setClient(client: OpencodeClient) {
    opencodeClient = client;
    generationManager.setClient(client);

    // Auto-detect provider in background
    detectProvider(client, projectRoot)
      .then((status) => {
        providerStatus = status;
        console.log("[loracle] Provider status:", status);
        if (status.provider) {
          const model = status.model ?? "us.anthropic.claude-sonnet-4-6";
          generationManager.setModel({
            providerID: status.provider,
            modelID: model,
          });
        }
      })
      .catch((err) => {
        console.warn("[loracle] Provider detection failed:", err);
      });
  }

  const routes: Route[] = [
    {
      method: "GET",
      pattern: /^\/loracle-api\/health$/,
      handler: (_req, res) => {
        json(res, { status: "ok", opencode: !!opencodeClient });
      },
    },
    // Provider status endpoint
    {
      method: "GET",
      pattern: /^\/loracle-api\/provider-status$/,
      handler: (_req, res) => {
        json(res, providerStatus);
      },
    },
    // Connect endpoint (manual API key)
    {
      method: "POST",
      pattern: /^\/loracle-api\/connect$/,
      handler: async (req, res) => {
        if (!opencodeClient) {
          json(res, { error: "AI backend is still starting. Please try again." }, 503);
          return;
        }

        const body = await parseBody(req);
        const { provider, apiKey } = body as { provider: string; apiKey: string };

        if (!provider || !apiKey) {
          json(res, { error: "provider and apiKey required" }, 400);
          return;
        }

        try {
          await configureProvider(opencodeClient, provider, apiKey, projectRoot);
          const detectedStatus = await detectProvider(opencodeClient, projectRoot);
          providerStatus = detectedStatus;
          if (detectedStatus.provider && detectedStatus.model) {
            generationManager.setModel({
              providerID: detectedStatus.provider,
              modelID: detectedStatus.model,
            });
          }
          json(res, { configured: true, provider });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to configure provider";
          json(res, { error: message }, 400);
        }
      },
    },
    // Eagerly warm up an OpenCode session for a story
    {
      method: "POST",
      pattern: /^\/loracle-api\/warm-session$/,
      handler: async (req, res) => {
        if (!opencodeClient) {
          json(res, { warmed: false }, 503);
          return;
        }

        const body = await parseBody(req);
        const { storyId } = body as { storyId: string };
        if (!storyId) {
          json(res, { error: "storyId required" }, 400);
          return;
        }

        generationManager
          .warmSession(storyId)
          .then(() => {
            console.log("[loracle] Session warmed for:", storyId);
          })
          .catch((err) => {
            console.warn("[loracle] Failed to warm session:", err);
          });

        // Return immediately — warming happens in background
        json(res, { warmed: true });
      },
    },
    {
      method: "GET",
      pattern: /^\/loracle-api\/session\/(?<storyId>[^/]+)$/,
      handler: (_req, res, params) => {
        const session = sessionStore.load(decodeURIComponent(params.storyId));
        json(res, { session });
      },
    },
    {
      method: "POST",
      pattern: /^\/loracle-api\/prompt$/,
      handler: async (req, res) => {
        if (!opencodeClient) {
          json(res, { error: "AI backend is still starting. Please try again." }, 503);
          return;
        }

        const body = await parseBody(req);
        const { prompt, storyId, storyFilePath, image } = body as {
          prompt: string;
          storyId: string;
          storyFilePath?: string;
          image?: { path: string; base64: string; mimeType: string };
        };
        if (!prompt || !storyId) {
          json(res, { error: "prompt and storyId required" }, 400);
          return;
        }
        const generationId = generationManager.startGeneration({
          prompt,
          storyId,
          storyFilePath,
          image,
        });
        json(res, { generationId });
      },
    },
    {
      method: "GET",
      pattern: /^\/loracle-api\/stream\/(?<id>[^/]+)$/,
      handler: (_req, res, params) => {
        const { id } = params;

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const unsubscribe = generationManager.subscribe(id, (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === "done" || event.type === "error") {
            res.end();
          }
        });

        _req.on("close", () => {
          unsubscribe();
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/loracle-api\/kill$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        const { generationId } = body as { generationId?: string };
        const killed = generationManager.killGeneration(generationId);
        json(res, { killed });
      },
    },
    // Revert to code snapshot at a specific message
    {
      method: "POST",
      pattern: /^\/loracle-api\/revert$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        const { storyId, messageIndex } = body as {
          storyId: string;
          messageIndex: number;
        };
        if (!storyId || messageIndex === undefined) {
          json(res, { error: "storyId and messageIndex required" }, 400);
          return;
        }

        const session = sessionStore.load(storyId);
        if (!session) {
          json(res, { error: "Session not found" }, 404);
          return;
        }

        const msg = session.messages[messageIndex];
        if (!msg) {
          json(res, { error: "Invalid message index" }, 400);
          return;
        }

        // Write snapshot to file if available
        if (msg.codeSnapshot && session.filePath) {
          const absPath = path.isAbsolute(session.filePath)
            ? session.filePath
            : path.join(projectRoot, session.filePath);
          fileManager.atomicWrite(absPath, msg.codeSnapshot);
        }

        // Truncate messages to this point
        session.messages = session.messages.slice(0, messageIndex);
        session.updatedAt = Date.now();
        session.cliSessionId = null;
        sessionStore.save(session);

        json(res, { reverted: true, messageIndex });
      },
    },
    // Image upload
    {
      method: "POST",
      pattern: /^\/loracle-api\/upload-image$/,
      handler: async (req, res) => {
        try {
          const result = await imageHandler.handleUpload(req);
          json(res, result);
        } catch (err) {
          json(
            res,
            { error: err instanceof Error ? err.message : "Upload failed" },
            500
          );
        }
      },
    },
    // Create new draft story
    {
      method: "POST",
      pattern: /^\/loracle-api\/create-draft$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        const { componentName } = body as { componentName: string };

        if (!componentName || !/^[A-Z][a-zA-Z0-9]*$/.test(componentName)) {
          json(
            res,
            { error: "componentName is required and must be PascalCase (e.g. LoginForm)" },
            400
          );
          return;
        }

        try {
          const filePath = fileManager.createDraftScaffold(componentName);
          const storyId = `ai-drafts-${componentName.toLowerCase()}--default`;
          json(res, { created: true, filePath, storyId }, 201);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("CONFLICT:")) {
            json(res, { error: `A draft named ${componentName} already exists.` }, 409);
          } else {
            throw err;
          }
        }
      },
    },
    // File change events SSE
    {
      method: "GET",
      pattern: /^\/loracle-api\/file-events$/,
      handler: (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const listener = (data: string) => {
          res.write(`data: ${data}\n\n`);
        };
        fileChangeListeners.add(listener);

        req.on("close", () => {
          fileChangeListeners.delete(listener);
        });
      },
    },
    // Watch a file
    {
      method: "POST",
      pattern: /^\/loracle-api\/watch$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        const { filePath } = body as { filePath: string };
        if (!filePath) {
          json(res, { error: "filePath required" }, 400);
          return;
        }

        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(projectRoot, filePath);

        fileManager.watchFile(absPath, () => {
          const event = JSON.stringify({
            type: "FILE_CHANGED",
            filePath: absPath,
          });
          for (const listener of fileChangeListeners) {
            listener(event);
          }
        });

        json(res, { watching: true, filePath: absPath });
      },
    },
  ];

  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    const url = req.url || "";
    const method = req.method || "GET";

    if (!url.startsWith("/loracle-api/")) {
      next();
      return;
    }

    const route = routes.find((r) => {
      return r.method === method && r.pattern.test(url);
    });

    if (!route) {
      json(res, { error: "Not found" }, 404);
      return;
    }

    const match = url.match(route.pattern);
    const params = match?.groups || {};

    Promise.resolve(route.handler(req, res, params)).catch((err) => {
      console.error("[loracle] Middleware error:", err);
      json(res, { error: "Internal server error" }, 500);
    });
  };

  return { middleware, setClient };
}
