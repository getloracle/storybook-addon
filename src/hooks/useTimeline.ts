import { useMemo, useCallback } from "react";
import type { ChatMessage } from "../types.js";
import { useLoracleApi } from "./useLoracleApi.js";

export interface TimelineTurn {
  index: number;
  userMessage: string;
  assistantMessage: string;
  timestamp: number;
  hasSnapshot: boolean;
}

export function useTimeline(
  messages: ChatMessage[],
  storyId: string | null,
  onRevert?: () => void
) {
  const api = useLoracleApi();

  const turns = useMemo<TimelineTurn[]>(() => {
    const result: TimelineTurn[] = [];
    for (let i = 0; i < messages.length; i += 2) {
      const user = messages[i];
      const assistant = messages[i + 1];
      if (user?.role === "user" && assistant?.role === "assistant") {
        result.push({
          index: Math.floor(i / 2),
          userMessage: user.content,
          assistantMessage: assistant.content,
          timestamp: assistant.timestamp,
          hasSnapshot: !!assistant.codeSnapshot,
        });
      }
    }
    return result;
  }, [messages]);

  const revert = useCallback(
    async (turnIndex: number) => {
      if (!storyId) return;
      const res = await fetch("/loracle-api/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, turnIndex }),
      });
      if (res.ok) {
        onRevert?.();
      }
    },
    [storyId, onRevert]
  );

  return { turns, revert };
}
