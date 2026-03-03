import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { SessionStore } from "./session-store.js";
import { FileManager } from "./file-manager.js";
import { GenerationManager } from "./generation-manager.js";
import { ImageHandler } from "./image-handler.js";

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

  // File change SSE clients
  const fileChangeListeners = new Set<(data: string) => void>();

  const routes: Route[] = [
    {
      method: "GET",
      pattern: /^\/loracle-api\/health$/,
      handler: (_req, res) => {
        json(res, { status: "ok" });
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
    // 5A: Revert to code snapshot at a specific message
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

        // Truncate messages to this point (remove everything after this message)
        session.messages = session.messages.slice(0, messageIndex);
        session.updatedAt = Date.now();
        session.cliSessionId = null;
        sessionStore.save(session);

        json(res, { reverted: true, messageIndex });
      },
    },
    // 5B: Image upload
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
    // 5C: Promote draft
    {
      method: "POST",
      pattern: /^\/loracle-api\/promote$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        const { sourcePath, targetDir } = body as {
          sourcePath: string;
          targetDir: string;
        };
        if (!sourcePath || !targetDir) {
          json(res, { error: "sourcePath and targetDir required" }, 400);
          return;
        }

        const absSource = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.join(projectRoot, sourcePath);
        const absTargetDir = path.isAbsolute(targetDir)
          ? targetDir
          : path.join(projectRoot, targetDir);
        const filename = path.basename(absSource);
        const absTarget = path.join(absTargetDir, filename);

        if (!fs.existsSync(absSource)) {
          json(res, { error: "Source file not found" }, 404);
          return;
        }

        if (!fs.existsSync(absTargetDir)) {
          fs.mkdirSync(absTargetDir, { recursive: true });
        }

        fs.renameSync(absSource, absTarget);
        json(res, { promoted: true, target: absTarget });
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
          // Deterministic story ID: "AI Drafts/ComponentName" -> "ai-drafts-componentname--default"
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
    // 5D: File change events SSE
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
    // 5D: Watch a file
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

  return (
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
}
