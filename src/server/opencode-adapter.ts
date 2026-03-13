import path from "path";
import { pathToFileURL } from "url";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { StreamEvent, ImageAttachment } from "../types.js";

interface OpenCodeSession {
  sessionId: string;
  abortController: AbortController;
}

export interface ModelConfig {
  providerID: string;
  modelID: string;
}

// Tools that are always safe to auto-approve (no path restriction)
const ALWAYS_ALLOW_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "ListDirectory",
]);

// Tools that are allowed only when targeting the current story file
const PATH_RESTRICTED_TOOLS = new Set([
  "Write",
  "Edit",
]);

// Tools that must never be approved
const ALWAYS_DENY_TOOLS = new Set([
  "Bash",
  "Terminal",
  "WebFetch",
]);

export class OpenCodeAdapter {
  private projectRoot: string;
  private client: OpencodeClient;
  private sessions: Map<string, OpenCodeSession> = new Map();
  private model: ModelConfig | null = null;
  private currentTargetPath: string | null = null;

  constructor(projectRoot: string, client: OpencodeClient) {
    this.projectRoot = projectRoot;
    this.client = client;
  }

  setModel(model: ModelConfig): void {
    this.model = model;
  }

  /**
   * Allow file edits for the current generation and track the target path
   * for permission filtering. Bash and webfetch are denied at the config level.
   */
  async setAllowedEditPath(filePath: string): Promise<void> {
    this.currentTargetPath = filePath;
    try {
      await this.client.config.update({
        body: {
          permission: {
            edit: "allow",
            bash: "deny",
            webfetch: "deny",
          },
        },
        query: { directory: this.projectRoot },
      });
      console.log("[loracle] Permissions configured — edit: allow, bash: deny, webfetch: deny. Target:", filePath);
    } catch (err) {
      console.warn("[loracle] Failed to update runtime config:", err);
    }
  }

  /**
   * Decide whether to approve or reject a permission request.
   * Returns "always" for safe tools, "reject" for dangerous ones,
   * and conditionally approves Write/Edit only for the target story file.
   */
  private resolvePermission(
    toolType: string,
    title: string,
    pattern?: string | string[]
  ): "always" | "reject" {
    // MCP tools (e.g. "loracle:get_components") are always allowed
    if (toolType.includes(":")) {
      return "always";
    }

    if (ALWAYS_DENY_TOOLS.has(toolType)) {
      console.warn("[loracle] DENIED permission for tool:", toolType, title);
      return "reject";
    }

    if (ALWAYS_ALLOW_TOOLS.has(toolType)) {
      return "always";
    }

    if (PATH_RESTRICTED_TOOLS.has(toolType)) {
      if (!this.currentTargetPath) {
        console.warn("[loracle] DENIED Write/Edit — no target path set:", title);
        return "reject";
      }

      const paths = Array.isArray(pattern) ? pattern : pattern ? [pattern] : [];
      if (paths.length === 0 && title) {
        paths.push(title);
      }

      const targetDir = path.dirname(this.currentTargetPath);
      const allowed = paths.length === 0 || paths.some((p) => {
        const normalized = path.normalize(p);
        return (
          normalized === path.normalize(this.currentTargetPath!) ||
          normalized.startsWith(path.normalize(targetDir) + path.sep)
        );
      });

      if (!allowed) {
        console.warn("[loracle] DENIED Write/Edit outside target path:", paths, "expected:", this.currentTargetPath);
        return "reject";
      }

      return "always";
    }

    // Unknown tool — deny by default
    console.warn("[loracle] DENIED unknown tool permission:", toolType, title);
    return "reject";
  }

  async createOrGetSession(storyId: string): Promise<string> {
    const existing = this.sessions.get(storyId);
    if (existing) {
      return existing.sessionId;
    }

    const result = await this.client.session.create({
      body: { title: `Loracle: ${storyId}` },
      query: { directory: this.projectRoot },
    });

    if (result.error) {
      console.error("[loracle] Failed to create session:", result.error);
      throw new Error(`Failed to create OpenCode session: ${JSON.stringify(result.error)}`);
    }

    const session = result.data;
    if (!session || !session.id) {
      console.error("[loracle] Unexpected session.create response:", JSON.stringify(result));
      throw new Error("OpenCode session.create returned no session data");
    }

    const sessionId = session.id;

    this.sessions.set(storyId, {
      sessionId,
      abortController: new AbortController(),
    });

    console.log("[loracle] Created OpenCode session:", { storyId, sessionId });
    return sessionId;
  }

  async sendMessage(
    storyId: string,
    prompt: string,
    image?: ImageAttachment
  ): Promise<{
    sessionId: string;
    stream: AsyncIterable<StreamEvent>;
  }> {
    const sessionId = await this.createOrGetSession(storyId);
    const session = this.sessions.get(storyId)!;

    // Create a fresh abort controller for this message
    session.abortController = new AbortController();

    const self = this;

    async function* streamEvents(): AsyncIterable<StreamEvent> {
      // Subscribe to events BEFORE sending the prompt so we don't miss anything
      const eventResult = await self.client.event.subscribe({
        query: { directory: self.projectRoot },
      });
      const sseStream = eventResult.stream;

      const parts: Array<{ type: string; text?: string; mime?: string; url?: string; filename?: string }> = [];
      parts.push({ type: "text", text: prompt });

      // Send image as a FilePartInput with file:// URL — OpenCode reads the file
      // from disk and converts to base64 internally (data: URLs only work for text/plain)
      if (image?.path) {
        const absolutePath = path.isAbsolute(image.path)
          ? image.path
          : path.resolve(self.projectRoot, image.path);
        parts.push({
          type: "file",
          mime: image.mimeType || "image/png",
          url: pathToFileURL(absolutePath).href,
          filename: path.basename(absolutePath),
        });
      }

      const promptResult = await self.client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: parts as Array<{ type: "text"; text: string } | { type: "file"; mime: string; url: string; filename?: string }>,
          ...(self.model && {
            model: {
              providerID: self.model.providerID,
              modelID: self.model.modelID,
            },
          }),
        },
        query: { directory: self.projectRoot },
      });
      if (promptResult.error) {
        console.error("[loracle] promptAsync error:", promptResult.error);
        yield { type: "error", content: `Prompt failed: ${JSON.stringify(promptResult.error)}` };
        return;
      }
      console.log("[loracle] Prompt sent to session:", sessionId);

      const abortSignal = session.abortController.signal;

      // Track IDs to filter user messages, reasoning, and deduplicate
      let userMessageId: string | null = null;
      const reasoningPartIds = new Set<string>();
      const deltaPartIds = new Set<string>(); // parts that received deltas (skip their updated text)

      try {
        for await (const event of sseStream) {
          if (abortSignal.aborted) break;

          if (!event) continue;

          let parsed: { type: string; properties: Record<string, unknown> };
          if (typeof event === "string") {
            try {
              parsed = JSON.parse(event);
            } catch {
              continue;
            }
          } else {
            parsed = event as { type: string; properties: Record<string, unknown> };
          }

          // Verbose trace: log every raw SSE event
          console.log("[loracle][trace] SSE event:", parsed.type, JSON.stringify(parsed.properties ?? {}).slice(0, 300));

          const props = parsed.properties || {};
          const part = props.part as { sessionID?: string; messageID?: string; type?: string; id?: string } | undefined;
          const eventSessionId =
            (props.sessionID as string) || part?.sessionID;

          // Filter events for our session only
          if (eventSessionId && eventSessionId !== sessionId) {
            console.log("[loracle][trace] Skipping event for other session:", eventSessionId);
            continue;
          }

          // Approve or reject permission requests based on tool allowlist
          if (parsed.type === "permission.updated") {
            const permissionId = (props.id as string) || "";
            if (permissionId) {
              const toolType = (props.type as string) || "";
              const title = (props.title as string) || "";
              const pattern = props.pattern as string | string[] | undefined;
              const response = self.resolvePermission(toolType, title, pattern);
              console.log(`[loracle] Permission ${response}:`, toolType, title);
              self.client
                .postSessionIdPermissionsPermissionId({
                  path: { id: sessionId, permissionID: permissionId },
                  body: { response },
                  query: { directory: self.projectRoot },
                })
                .catch((err) => {
                  console.warn("[loracle] Failed to respond to permission:", err);
                });
            }
            continue;
          }

          // Identify the user message from message.updated with role=user
          if (parsed.type === "message.updated") {
            const info = props.info as { id?: string; role?: string } | undefined;
            if (info?.role === "user" && info.id && !userMessageId) {
              userMessageId = info.id;
            }
          }

          const eventMessageId = (props.messageID as string) || part?.messageID;
          if (eventMessageId && eventMessageId === userMessageId) {
            console.log("[loracle][trace] Skipping user message event:", parsed.type);
            continue;
          }

          // Track reasoning part IDs to filter their deltas
          if (parsed.type === "message.part.updated" && part?.type === "reasoning" && part.id) {
            console.log("[loracle][trace] Reasoning part detected, will filter deltas for:", part.id);
            reasoningPartIds.add(part.id);
          }

          // For deltas: skip reasoning, track text partIDs for dedup
          if (parsed.type === "message.part.delta") {
            const partId = props.partID as string;
            if (partId && reasoningPartIds.has(partId)) continue;
            if (partId) deltaPartIds.add(partId);
          }

          // For message.part.updated text: skip if we already streamed via deltas
          if (parsed.type === "message.part.updated" && part?.type === "text" && part.id) {
            if (deltaPartIds.has(part.id)) continue;
          }

          // Handle session.idle: break the loop (done is emitted after).
          // We break instead of returning immediately so any buffered text events
          // from the final step are still processed before emitting done.
          if (parsed.type === "session.idle") {
            console.log("[loracle][trace] Session idle — ending stream");
            break;
          }

          if (parsed.type === "session.error") {
            const error = props.error as { message?: string } | string | undefined;
            const msg =
              typeof error === "string"
                ? error
                : (error as { message?: string })?.message ?? "Unknown error";
            yield { type: "error", content: msg };
            return;
          }

          const mapped = self.mapEvent(parsed);
          if (mapped) {
            yield mapped;
          }
        }
      } catch (err) {
        if (!abortSignal.aborted) {
          yield {
            type: "error",
            content: err instanceof Error ? err.message : "Stream error",
          };
        }
      }

      yield { type: "done", content: "completed" };
    }

    return { sessionId, stream: streamEvents() };
  }

  kill(storyId: string): void {
    const session = this.sessions.get(storyId);
    if (!session) return;

    session.abortController.abort();
    this.sessions.delete(storyId);

    // Abort the session on the server
    this.client.session
      .abort({
        path: { id: session.sessionId },
        query: { directory: this.projectRoot },
      })
      .catch((err) => {
        console.warn("[loracle] Failed to abort session:", err);
      });
  }

  private mapEvent(event: {
    type: string;
    properties: Record<string, unknown>;
  }): StreamEvent | null {
    const { type, properties } = event;

    // Streaming text deltas — preferred for real-time streaming
    if (type === "message.part.delta") {
      const delta = properties.delta as string | undefined;
      if (delta) {
        return { type: "text", content: delta };
      }
      return null;
    }

    if (type === "message.part.updated") {
      const part = properties.part as {
        type: string;
        text?: string;
        tool?: string;
        state?: { status: string; input?: Record<string, unknown> };
      };

      if (!part) return null;

      // Text parts from assistant — emit as fallback when deltas don't fire.
      // User message text is already filtered by messageID in the stream loop.
      if (part.type === "text") {
        const content = part.text ?? "";
        if (!content) return null;
        return { type: "text", content };
      }

      if (part.type === "tool") {
        const state = part.state;
        if (state?.status === "running" || state?.status === "pending") {
          console.log(`[loracle][trace] Tool call: ${part.tool} (${state.status})`, JSON.stringify(state.input ?? {}).slice(0, 500));
          return {
            type: "tool_use",
            toolName: part.tool,
            toolInput: state.input,
          };
        }
        if (state?.status === "completed") {
          const output = (state as Record<string, unknown>).output;
          console.log(`[loracle][trace] Tool done: ${part.tool}`, output ? JSON.stringify(output).slice(0, 300) : "(no output)");
          return {
            type: "tool_result",
            toolName: part.tool,
          };
        }
        if (state?.status === "error") {
          const errorDetail = (state as Record<string, unknown>).error;
          console.error(`[loracle][trace] Tool error: ${part.tool}`, errorDetail ? JSON.stringify(errorDetail).slice(0, 300) : "");
          return {
            type: "error",
            content: `Tool error: ${part.tool}`,
          };
        }
      }

      return null;
    }

    // session.idle and session.error are handled directly in the stream loop
    // (not here) to allow flushing buffered events before terminating.

    return null;
  }
}
