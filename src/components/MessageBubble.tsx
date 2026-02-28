import React from "react";
import { styled } from "storybook/internal/theming";
import type { ChatMessage } from "../types.js";

const BubbleContainer = styled.div<{ isUser: boolean }>(({ isUser }) => ({
  display: "flex",
  justifyContent: isUser ? "flex-end" : "flex-start",
  marginBottom: "8px",
  padding: "0 12px",
}));

const Bubble = styled.div<{ isUser: boolean }>(({ isUser }) => ({
  maxWidth: "85%",
  padding: "8px 12px",
  borderRadius: "12px",
  fontSize: "13px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  ...(isUser
    ? {
        backgroundColor: "#3b82f6",
        color: "#fff",
        borderBottomRightRadius: "4px",
      }
    : {
        backgroundColor: "rgba(255,255,255,0.08)",
        color: "#e5e5e5",
        borderBottomLeftRadius: "4px",
      }),
}));

const RoleLabelRow = styled.div<{ isUser: boolean }>(({ isUser }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: isUser ? "flex-end" : "flex-start",
  gap: "8px",
  padding: "0 16px",
  marginBottom: "2px",
}));

const RoleLabel = styled.div({
  fontSize: "10px",
  color: "#888",
});

const RestoreButton = styled.button({
  fontSize: "10px",
  color: "#93c5fd",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 4px",
  borderRadius: "4px",
  transition: "all 0.15s",
  "&:hover": {
    color: "#60a5fa",
    backgroundColor: "rgba(96, 165, 250, 0.1)",
  },
});

interface MessageBubbleProps {
  message: ChatMessage;
  messageIndex: number;
  onRestore?: (messageIndex: number) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  messageIndex,
  onRestore,
}) => {
  const isUser = message.role === "user";

  return (
    <div>
      <RoleLabelRow isUser={isUser}>
        <RoleLabel>{isUser ? "You" : "Claude"}</RoleLabel>
        {isUser && onRestore && (
          <RestoreButton
            onClick={() => onRestore(messageIndex)}
            title="Restore code to this point"
          >
            Restore
          </RestoreButton>
        )}
      </RoleLabelRow>
      <BubbleContainer isUser={isUser}>
        <Bubble isUser={isUser}>{message.content}</Bubble>
      </BubbleContainer>
    </div>
  );
};
