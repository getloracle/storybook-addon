import React, { useState, useEffect, useCallback, useRef } from "react";
import { styled } from "storybook/internal/theming";
import { useStorybookApi } from "storybook/internal/manager-api";
import { useChat } from "../hooks/useChat.js";
import { useLoracleApi } from "../hooks/useLoracleApi.js";
import { useCurrentStory } from "../hooks/useCurrentStory.js";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { ActivityStatus } from "./ActivityStatus.js";
import { PromptInput } from "./PromptInput.js";
import { NewDraftDialog } from "./NewDraftDialog.js";
import { Onboarding } from "./Onboarding.js";

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

// Module-level cache so provider status survives component remounts
let _providerDetected = false;

export const ChatPanel: React.FC<{ active?: boolean }> = ({ active = false }) => {
  const sbApi = useStorybookApi();
  const loracleApi = useLoracleApi();
  const { storyId, storyTitle, storyFilePath } = useCurrentStory();
  const { messages, state, phase, streamingText, send, stop, isActive } = useChat(storyId, storyFilePath);
  const [showNewDraft, setShowNewDraft] = useState(false);
  const [createDraftError, setCreateDraftError] = useState<string | undefined>(undefined);
  const [fileChanged, setFileChanged] = useState(false);
  const [providerReady, setProviderReady] = useState<boolean | null>(_providerDetected ? true : null);
  const pendingPromptRef = useRef<string | null>(null);
  const warmedSessionsRef = useRef<Set<string>>(new Set());


  // Poll provider status until configured (never gives up — keeps trying every 2s)
  useEffect(() => {
    if (_providerDetected) return;
    let cancelled = false;
    const check = () => {
      fetch("/loracle-api/provider-status")
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.configured) {
            _providerDetected = true;
            setProviderReady(true);
          } else {
            setTimeout(check, 2000);
          }
        })
        .catch(() => {
          if (!cancelled) setTimeout(check, 2000);
        });
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // Eagerly warm the OpenCode session when panel is active for a story
  useEffect(() => {
    if (active && storyId && providerReady && !warmedSessionsRef.current.has(storyId)) {
      warmedSessionsRef.current.add(storyId);
      loracleApi.warmSession(storyId);
    }
  }, [active, storyId, providerReady]);

  // Auto-send pending prompt after navigating to the new draft story
  useEffect(() => {
    if (pendingPromptRef.current && storyId && storyFilePath) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      send(prompt);
    }
  }, [storyId, storyFilePath, send]);

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

  const handleCreateDraft = useCallback(
    async (componentName: string, description: string) => {
      setCreateDraftError(undefined);
      const result = await loracleApi.createDraft(componentName);
      if (!result.created) {
        setCreateDraftError(result.error ?? "Failed to create draft. Please try again.");
        return;
      }

      setShowNewDraft(false);

      // Store the prompt to auto-send after navigation
      if (description) {
        pendingPromptRef.current = description;
      }

      // Poll for Storybook to register the new story, then navigate
      const targetStoryId = result.storyId;
      const pollInterval = 300;
      const maxAttempts = 17; // ~5s
      let attempts = 0;

      const poll = setInterval(() => {
        attempts++;
        const data = sbApi.getData(targetStoryId);
        if (data) {
          clearInterval(poll);
          sbApi.selectStory(targetStoryId);
        } else if (attempts >= maxAttempts) {
          clearInterval(poll);
          // Fallback: reload so Storybook picks up the file
          window.location.reload();
        }
      }, pollInterval);
    },
    [loracleApi, sbApi]
  );


  // Show onboarding if provider not configured (after all hooks)
  if (providerReady === false) {
    return <Onboarding />;
  }

  return (
    <Container>
      <StatusBar
        storyTitle={storyTitle}
        onNewDraft={() => { setShowNewDraft(true); setCreateDraftError(undefined); }}
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
        isStreaming={isActive}
        hideStreamingBubble={false}
        onRestore={handleRestore}
      />
      <ActivityStatus phase={phase} />
      <PromptInput
        onSend={send}
        onStop={stop}
        isStreaming={isActive}
        disabled={!storyId}
      />
      {showNewDraft && (
        <NewDraftDialog
          onCreate={handleCreateDraft}
          onCancel={() => { setShowNewDraft(false); setCreateDraftError(undefined); }}
          serverError={createDraftError}
        />
      )}
    </Container>
  );
};
