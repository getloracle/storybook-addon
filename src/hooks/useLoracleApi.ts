import type { ChatSession, StreamEvent, ImageAttachment } from "../types.js";

const BASE = "/loracle-api";

export function useLoracleApi() {
  async function health(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE}/health`);
      const data = await res.json();
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  async function getSession(storyId: string): Promise<ChatSession | null> {
    const res = await fetch(`${BASE}/session/${encodeURIComponent(storyId)}`);
    const data = await res.json();
    return data.session;
  }

  /**
   * Send a prompt and stream the response in a single HTTP request.
   * The server returns an SSE stream: first event is { type: "started", generationId }
   * followed by the usual StreamEvent flow.
   */
  function promptAndStream(
    opts: {
      prompt: string;
      storyId: string;
      storyFilePath?: string;
      image?: ImageAttachment;
    },
    onEvent: (event: StreamEvent) => void,
    onDone: (generationId: string | null) => void
  ): () => void {
    const controller = new AbortController();
    let generationId: string | null = null;

    fetch(`${BASE}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || `Prompt failed (${res.status})`);
        }
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                // First event carries the generationId
                if (parsed.type === "started" && parsed.generationId) {
                  generationId = parsed.generationId;
                  continue;
                }
                const event = parsed as StreamEvent;
                onEvent(event);
                if (event.type === "done" || event.type === "error") {
                  onDone(generationId);
                  return;
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
        onDone(generationId);
      })
      .catch(() => {
        onDone(generationId);
      });

    return () => {
      controller.abort();
    };
  }

  async function kill(generationId?: string): Promise<boolean> {
    const res = await fetch(`${BASE}/kill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generationId }),
    });
    const data = await res.json();
    return data.killed;
  }

  async function createDraft(
    componentName: string
  ): Promise<{ created: boolean; filePath: string; storyId: string; error?: string }> {
    const res = await fetch(`${BASE}/create-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentName }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { created: false, filePath: "", storyId: "", error: data.error };
    }
    return data;
  }

  function warmSession(storyId: string): void {
    fetch(`${BASE}/warm-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId }),
    }).catch(() => {
      // Fire-and-forget — don't block on warming failures
    });
  }

  return { health, getSession, promptAndStream, kill, createDraft, warmSession };
}
