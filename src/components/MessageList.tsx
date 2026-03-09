import React, { useRef, useEffect } from "react";
import { styled } from "storybook/internal/theming";
import type { ChatMessage } from "../types.js";
import { MessageBubble } from "./MessageBubble.js";

const Container = styled.div({
  flex: 1,
  overflowY: "auto",
  padding: "12px 0",
});

const StreamingBubble = styled.div({
  padding: "0 12px",
  marginBottom: "8px",
});

const StreamingLabel = styled.div({
  fontSize: "10px",
  color: "#888",
  marginBottom: "2px",
  padding: "0 16px",
});

const StreamingContent = styled.div({
  maxWidth: "85%",
  padding: "8px 12px",
  borderRadius: "12px",
  borderBottomLeftRadius: "4px",
  fontSize: "13px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  backgroundColor: "rgba(255,255,255,0.08)",
  color: "#e5e5e5",
});

const EmptyState = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#666",
  fontSize: "13px",
  textAlign: "center",
  padding: "24px",
});

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  hideStreamingBubble?: boolean;
  onRestore?: (messageIndex: number) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingText,
  isStreaming,
  hideStreamingBubble,
  onRestore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <Container ref={containerRef}>
        <EmptyState>
          Send a prompt to start designing with Claude.
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container ref={containerRef}>
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} messageIndex={i} onRestore={onRestore} />
      ))}
      {isStreaming && streamingText && !hideStreamingBubble && (
        <StreamingBubble>
          <StreamingLabel>Claude</StreamingLabel>
          <StreamingContent>{streamingText}</StreamingContent>
        </StreamingBubble>
      )}
    </Container>
  );
};
