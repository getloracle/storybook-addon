import React, { useState, useEffect, useCallback } from "react";
import { styled } from "storybook/internal/theming";
import { useChat } from "../hooks/useChat.js";
import { useCurrentStory } from "../hooks/useCurrentStory.js";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { PromptInput } from "./PromptInput.js";
import { PromoteDialog } from "./PromoteDialog.js";

const Container = styled.div({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#1a1a1a",
  position: "relative",
});

const Banner = styled.div({
  padding: "8px 12px",
  backgroundColor: "#422006",
  color: "#fbbf24",
  fontSize: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid #854d0e",
});

const BannerButton = styled.button({
  padding: "2px 8px",
  fontSize: "11px",
  border: "1px solid #854d0e",
  borderRadius: "4px",
  backgroundColor: "transparent",
  color: "#fbbf24",
  cursor: "pointer",
  "&:hover": { backgroundColor: "#854d0e" },
});

export const ChatPanel: React.FC = () => {
  const { storyId, storyTitle, storyFilePath } = useCurrentStory();
  const { messages, state, streamingText, send, stop } = useChat(storyId, storyFilePath);
  const [showPromote, setShowPromote] = useState(false);
  const [fileChanged, setFileChanged] = useState(false);

  const isDraft = storyFilePath?.includes("__ai_drafts__") ?? false;

  const handleRestore = useCallback(
    async (messageIndex: number) => {
      if (!storyId) return;
      const res = await fetch("/loracle-api/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, messageIndex }),
      });
      if (res.ok) {
        window.location.reload();
      }
    },
    [storyId]
  );

  // 5D: File change detection via SSE
  useEffect(() => {
    if (!storyFilePath) return;

    const eventSource = new EventSource("/loracle-api/file-events");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "FILE_CHANGED" && data.filePath === storyFilePath) {
          setFileChanged(true);
        }
      } catch {}
    };

    // Register watch
    fetch("/loracle-api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: storyFilePath }),
    });

    return () => {
      eventSource.close();
    };
  }, [storyFilePath]);

  const handlePromote = useCallback(
    async (targetDir: string) => {
      if (!storyFilePath) return;
      await fetch("/loracle-api/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: storyFilePath, targetDir }),
      });
      setShowPromote(false);
    },
    [storyFilePath]
  );

  const handleImageUpload = useCallback(
    (imagePath: string) => {
      // Prepend image reference to next prompt
      send(`[Image: ${imagePath}] `);
    },
    [send]
  );

  return (
    <Container>
      <StatusBar
        storyTitle={storyTitle}
        isDraft={isDraft}
        onPromote={isDraft ? () => setShowPromote(true) : undefined}
      />
      {fileChanged && (
        <Banner>
          <span>File edited externally. Click to sync.</span>
          <BannerButton onClick={() => { setFileChanged(false); window.location.reload(); }}>
            Sync
          </BannerButton>
        </Banner>
      )}
      <MessageList
        messages={messages}
        streamingText={streamingText}
        isStreaming={state === "streaming"}
        onRestore={handleRestore}
      />
      <PromptInput
        onSend={send}
        onStop={stop}
        isStreaming={state === "streaming"}
        disabled={!storyId}
      />
      {showPromote && storyFilePath && (
        <PromoteDialog
          storyFilePath={storyFilePath}
          onPromote={handlePromote}
          onCancel={() => setShowPromote(false)}
        />
      )}
    </Container>
  );
};
