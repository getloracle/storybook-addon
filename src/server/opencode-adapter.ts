import type { OpencodeClient } from "@opencode-ai/sdk";
import type { StreamEvent } from "../types.js";

interface OpenCodeSession {
  sessionId: string;
  abortController: AbortController;
}

export class OpenCodeAdapter {
  private projectRoot: string;
  private client: OpencodeClient;
  private sessions: Map<string, OpenCodeSession> = new Map();

  constructor(projectRoot: string, client: OpencodeClient) {
    this.projectRoot = projectRoot;
    this.client = client;
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
    prompt: string
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
      // event.subscribe() returns { stream: AsyncGenerator<Event> }
      const eventResult = await self.client.event.subscribe({
        query: { directory: self.projectRoot },
      });
      const sseStream = eventResult.stream;

      // Send prompt async (fire-and-forget)
      const promptResult = await self.client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: prompt }],
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

      try {
        for await (const event of sseStream) {
          if (abortSignal.aborted) break;

          if (!event) continue;

          // The event is an Event union type (e.g. { type: "message.part.updated", properties: ... })
          // It may come as a raw object or need parsing
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

          // Filter events for our session
          const props = parsed.properties || {};
          const eventSessionId =
            (props.sessionID as string) ||
            (props.part as { sessionID?: string })?.sessionID;

          if (eventSessionId && eventSessionId !== sessionId) continue;

          // Map OpenCode events to StreamEvent
          const mapped = self.mapEvent(parsed);
          if (mapped) {
            yield mapped;
            if (mapped.type === "done" || mapped.type === "error") {
              return;
            }
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

    if (type === "message.part.updated") {
      const part = properties.part as {
        type: string;
        text?: string;
        tool?: string;
        state?: { status: string; input?: Record<string, unknown> };
      };
      const delta = properties.delta as string | undefined;

      if (!part) return null;

      if (part.type === "text") {
        // Use delta for streaming text, fall back to full text
        const content = delta ?? part.text ?? "";
        if (!content) return null;
        return { type: "text", content };
      }

      if (part.type === "tool") {
        const state = part.state;
        if (state?.status === "running" || state?.status === "pending") {
          return {
            type: "tool_use",
            toolName: part.tool,
            toolInput: state.input,
          };
        }
        if (state?.status === "completed") {
          return {
            type: "tool_result",
            toolName: part.tool,
          };
        }
        if (state?.status === "error") {
          return {
            type: "error",
            content: `Tool error: ${part.tool}`,
          };
        }
      }

      return null;
    }

    if (type === "session.idle") {
      return { type: "done", content: "completed" };
    }

    if (type === "session.error") {
      const error = properties.error as { message?: string } | string | undefined;
      const msg =
        typeof error === "string"
          ? error
          : error?.message ?? "Unknown error";
      return { type: "error", content: msg };
    }

    return null;
  }
}
