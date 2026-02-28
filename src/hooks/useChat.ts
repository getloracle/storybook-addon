import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, StreamEvent } from "../types.js";
import { useLoracleApi } from "./useLoracleApi.js";

type ChatState = "idle" | "streaming" | "error";

export function useChat(storyId: string | null, storyFilePath?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ChatState>("idle");
  const [streamingText, setStreamingText] = useState("");
  const api = useLoracleApi();
  const cancelRef = useRef<(() => void) | null>(null);
  const currentStoryRef = useRef(storyId);

  // Load session when story changes
  useEffect(() => {
    currentStoryRef.current = storyId;
    if (!storyId) {
      setMessages([]);
      return;
    }

    api.getSession(storyId).then((session) => {
      if (currentStoryRef.current === storyId && session) {
        setMessages(session.messages);
      }
    });
  }, [storyId]);

  const send = useCallback(
    async (prompt: string) => {
      if (!storyId || state === "streaming") return;

      const userMessage: ChatMessage = {
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setState("streaming");
      setStreamingText("");

      try {
        const generationId = await api.sendPrompt({
          prompt,
          storyId,
          storyFilePath: storyFilePath || undefined,
        });

        let fullText = "";

        const cancel = api.streamGeneration(
          generationId,
          (event: StreamEvent) => {
            if (event.type === "text" && event.content) {
              fullText += event.content;
              setStreamingText(fullText);
            }
            if (event.type === "error") {
              setState("error");
              if (event.content) {
                fullText += `\n\nError: ${event.content}`;
                setStreamingText(fullText);
              }
            }
          },
          () => {
            if (fullText) {
              const assistantMessage: ChatMessage = {
                role: "assistant",
                content: fullText,
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, assistantMessage]);
            }
            setStreamingText("");
            setState("idle");
            cancelRef.current = null;
          }
        );

        cancelRef.current = cancel;
      } catch {
        setState("error");
      }
    },
    [storyId, storyFilePath, state, api]
  );

  const stop = useCallback(async () => {
    cancelRef.current?.();
    cancelRef.current = null;
    await api.kill();
    setState("idle");
    setStreamingText("");
  }, [api]);

  return {
    messages,
    state,
    streamingText,
    send,
    stop,
  };
}
