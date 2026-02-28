import React, { useState, useRef, useCallback } from "react";
import { styled } from "storybook/internal/theming";

const Container = styled.div({
  display: "flex",
  gap: "8px",
  padding: "8px 12px",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  alignItems: "flex-end",
});

const TextArea = styled.textarea({
  flex: 1,
  resize: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  lineHeight: "1.4",
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "#e5e5e5",
  outline: "none",
  fontFamily: "inherit",
  minHeight: "36px",
  maxHeight: "120px",
  "&:focus": {
    borderColor: "#3b82f6",
  },
  "&::placeholder": {
    color: "#666",
  },
});

const SendButton = styled.button({
  padding: "8px 16px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#3b82f6",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: "#2563eb",
  },
  "&:disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
});

const StopButton = styled.button({
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid #ef4444",
  backgroundColor: "transparent",
  color: "#ef4444",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
});

interface PromptInputProps {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onSend,
  onStop,
  isStreaming,
  disabled,
}) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
    }
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "36px";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  return (
    <Container>
      <TextArea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Describe what you want to build..."
        disabled={disabled || isStreaming}
        rows={1}
      />
      {isStreaming ? (
        <StopButton onClick={onStop}>Stop</StopButton>
      ) : (
        <SendButton onClick={handleSend} disabled={disabled || !value.trim()}>
          Send
        </SendButton>
      )}
    </Container>
  );
};
