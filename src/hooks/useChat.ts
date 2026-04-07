import { useState, useCallback, useRef, useEffect } from "react";
import { addons } from "storybook/internal/manager-api";
import type {
  ChatMessage,
  StreamEvent,
  ImageAttachment,
  GenerationPhase,
} from "../types.js";
import { EVENTS } from "../constants.js";
import { useLoracleApi } from "./useLoracleApi.js";

function mapToolToPhase(toolName: string): GenerationPhase | null {
  switch (toolName) {
    case "mcp__loracle__get_components":
    case "mcp__loracle__analyze_ui":
      return "design-system";
    case "Edit":
    case "Write":
      return "writing";
    // Read, Glob, Grep are silent — don't change phase
    default:
      return null;
  }
}

const PHASE_STATUS_TEXT: Record<string, string> = {
  submitted: "Sending...",
  thinking: "Working on it...",
  "design-system": "Checking the design system...",
  writing: "Applying changes...",
  done: "Done",
};

export function getPhaseStatusText(phase: GenerationPhase): string {
  return PHASE_STATUS_TEXT[phase] ?? "";
}

export function useChat(storyId: string | null, storyFilePath?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [streamingText, setStreamingText] = useState("");
  const api = useLoracleApi();
  const cancelRef = useRef<(() => void) | null>(null);
  const currentStoryRef = useRef(storyId);
  const phaseRef = useRef<GenerationPhase>("idle");
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep phaseRef in sync for use inside callbacks
  const updatePhase = useCallback((newPhase: GenerationPhase) => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }, []);

  // Load session when story changes
  useEffect(() => {
    currentStoryRef.current = storyId;
    setMessages([]);
    if (!storyId) {
      return;
    }

    api.getSession(storyId).then((session) => {
      if (currentStoryRef.current === storyId && session) {
        setMessages(session.messages);
      }
    });
  }, [storyId]);

  // Cleanup done timer on unmount
  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  const send = useCallback(
    async (prompt: string, image?: ImageAttachment) => {
      if (!storyId || (phase !== "idle" && phase !== "error")) return;

      // Clear any lingering done timer
      if (doneTimerRef.current) {
        clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        image,
      };
      setMessages((prev) => [...prev, userMessage]);
      updatePhase("submitted");
      setStreamingText("");

      // Notify preview iframe to show loader
      try {
        addons.getChannel().emit(EVENTS.STREAM_START, { storyId });
      } catch {
        // Channel may not be available in tests
      }

      try {
        let fullText = "";
        let receivedFirstEvent = false;

        const cancel = api.promptAndStream(
          {
            prompt,
            storyId,
            storyFilePath: storyFilePath || undefined,
            image,
          },
          (event: StreamEvent) => {
            // Transition from submitted → thinking on first event
            if (!receivedFirstEvent) {
              receivedFirstEvent = true;
              if (phaseRef.current === "submitted") {
                updatePhase("thinking");
              }
            }

            if (event.type === "text" && event.content) {
              fullText += event.content;
              setStreamingText(fullText);
            }

            if (event.type === "tool_use" && event.toolName) {
              const newPhase = mapToolToPhase(event.toolName);
              // Only update if phase actually changes (dedup rule)
              if (newPhase && newPhase !== phaseRef.current) {
                updatePhase(newPhase);
              }
            }

            if (event.type === "error") {
              updatePhase("error");
              try {
                addons.getChannel().emit(EVENTS.STREAM_ERROR, { storyId });
              } catch {
                // Channel may not be available
              }
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

            // Show "Done" for 2s, then fade to idle
            if (phaseRef.current !== "error") {
              updatePhase("done");
              try {
                addons.getChannel().emit(EVENTS.STREAM_END, { storyId });
              } catch {
                // Channel may not be available
              }
              doneTimerRef.current = setTimeout(() => {
                updatePhase("idle");
                doneTimerRef.current = null;
              }, 2000);
            }

            cancelRef.current = null;
          }
        );

        cancelRef.current = cancel;
      } catch {
        updatePhase("error");
        try {
          addons.getChannel().emit(EVENTS.STREAM_ERROR, { storyId });
        } catch {
          // Channel may not be available
        }
      }
    },
    [storyId, storyFilePath, phase, api, updatePhase]
  );

  const stop = useCallback(async () => {
    cancelRef.current?.();
    cancelRef.current = null;
    await api.kill();
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    updatePhase("idle");
    setStreamingText("");
    // Remove preview overlay immediately
    try {
      addons.getChannel().emit(EVENTS.STREAM_END, { storyId });
    } catch {
      // Channel may not be available
    }
  }, [api, updatePhase, storyId]);

  // Derive isStreaming for backward compat (input disable, stop button)
  const isActive =
    phase === "submitted" ||
    phase === "thinking" ||
    phase === "design-system" ||
    phase === "writing";

  return {
    messages,
    phase,
    streamingText,
    send,
    stop,
    // Backward compat: components that check isStreaming still work
    state: isActive ? ("streaming" as const) : phase === "error" ? ("error" as const) : ("idle" as const),
    isActive,
  };
}
