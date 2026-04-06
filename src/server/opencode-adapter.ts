import { pathToFileURL } from "url";
import path from "path";
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

export class OpenCodeAdapter {
  private projectRoot: string;
  private client: OpencodeClient;
  private sessions: Map<string, OpenCodeSession> = new Map();
  private model: ModelConfig | null = null;

  constructor(projectRoot: string, client: OpencodeClient) {
    this.projectRoot = projectRoot;
    this.client = client;
  }

  setModel(model: ModelConfig): void {
    this.model = model;
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
      // Subscribe to events and start consuming BEFORE sending the prompt.
      // The SDK's event.subscribe() returns a lazy async generator — the HTTP
      // connection is only established when iterated. We must pull from it
      // eagerly to avoid a race where fast-completing prompts emit session.idle
      // before we connect.
      const eventResult = await self.client.event.subscribe({
        query: { directory: self.projectRoot },
      });
      const sseStream = eventResult.stream;

      // Eagerly pull SSE events into a buffer so the HTTP connection is active
      // while we send the prompt. This closes the race window.
      type ParsedEvent = { type: string; properties: Record<string, unknown> };
      const eventBuffer: ParsedEvent[] = [];
      let sseStreamDone = false;
      let sseStreamError: Error | null = null;
      let resolveWaiter: (() => void) | null = null;

      // Start consuming immediately (fire-and-forget, awaited via buffer)
      const _consumeSse = (async () => {
        try {
          for await (const event of sseStream) {
            if (!event) continue;
            let parsed: ParsedEvent;
            if (typeof event === "string") {
              try { parsed = JSON.parse(event); } catch { continue; }
            } else {
              parsed = event as ParsedEvent;
            }
            eventBuffer.push(parsed);
            resolveWaiter?.();
          }
        } catch (err) {
          sseStreamError = err instanceof Error ? err : new Error(String(err));
        } finally {
          sseStreamDone = true;
          resolveWaiter?.();
        }
      })();

      // Helper: pull next parsed event from the buffer (waits if needed)
      async function nextEvent(): Promise<ParsedEvent | null> {
        while (eventBuffer.length === 0 && !sseStreamDone) {
          await new Promise<void>((r) => { resolveWaiter = r; });
        }
        if (eventBuffer.length > 0) return eventBuffer.shift()!;
        if (sseStreamError) throw sseStreamError;
        return null; // stream ended
      }

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
        while (true) {
          if (abortSignal.aborted) break;

          const parsed = await nextEvent();
          if (!parsed) break;

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
          // Treat tool errors as non-fatal: the LLM will continue and handle
          // the error itself (retry, explain, etc.). Only session.error is truly
          // fatal. Converting to tool_result keeps the SSE stream open so the
          // LLM's follow-up response reaches the client.
          return {
            type: "tool_result",
            toolName: part.tool,
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
