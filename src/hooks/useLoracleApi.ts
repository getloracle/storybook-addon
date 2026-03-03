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

  async function sendPrompt(opts: {
    prompt: string;
    storyId: string;
    storyFilePath?: string;
    image?: ImageAttachment;
  }): Promise<string> {
    const res = await fetch(`${BASE}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    return data.generationId;
  }

  function streamGeneration(
    generationId: string,
    onEvent: (event: StreamEvent) => void,
    onDone: () => void
  ): () => void {
    const controller = new AbortController();

    fetch(`${BASE}/stream/${generationId}`, { signal: controller.signal })
      .then(async (res) => {
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
                const event = JSON.parse(line.slice(6)) as StreamEvent;
                onEvent(event);
                if (event.type === "done" || event.type === "error") {
                  onDone();
                  return;
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
        onDone();
      })
      .catch(() => {
        onDone();
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

  return { health, getSession, sendPrompt, streamGeneration, kill, createDraft };
}
