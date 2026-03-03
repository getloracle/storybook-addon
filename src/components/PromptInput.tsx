import React, { useState, useRef, useCallback, useEffect } from "react";
import { styled } from "storybook/internal/theming";
import type { ImageAttachment } from "../types.js";

const Container = styled.div<{ isDragOver: boolean }>(({ isDragOver }) => ({
  display: "flex",
  flexDirection: "column",
  padding: "8px 12px",
  borderTop: isDragOver
    ? "2px solid #3b82f6"
    : "1px solid rgba(255,255,255,0.1)",
  transition: "border-color 0.15s",
}));

const InputRow = styled.div({
  display: "flex",
  gap: "8px",
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

const AttachButton = styled.button({
  padding: "8px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.15)",
  backgroundColor: "transparent",
  color: "#888",
  fontSize: "16px",
  cursor: "pointer",
  lineHeight: 1,
  "&:hover": {
    borderColor: "#666",
    color: "#ccc",
  },
  "&:disabled": {
    opacity: 0.4,
    cursor: "default",
  },
});

const HiddenInput = styled.input({
  display: "none",
});

const PreviewRow = styled.div({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "8px",
});

const Thumbnail = styled.img({
  maxWidth: "80px",
  maxHeight: "60px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.15)",
  objectFit: "cover",
});

const RemoveButton = styled.button({
  padding: "2px 6px",
  fontSize: "11px",
  border: "1px solid #666",
  borderRadius: "4px",
  backgroundColor: "transparent",
  color: "#888",
  cursor: "pointer",
  "&:hover": {
    borderColor: "#ef4444",
    color: "#ef4444",
  },
});

interface PromptInputProps {
  onSend: (prompt: string, image?: ImageAttachment) => void;
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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage preview URL lifecycle
  useEffect(() => {
    if (pendingImage) {
      const url = URL.createObjectURL(pendingImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [pendingImage]);

  const setImageFromFile = useCallback((file: File) => {
    if (file.type.startsWith("image/")) {
      setPendingImage(file);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed && !pendingImage) return;

    if (pendingImage) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("image", pendingImage);
        const res = await fetch("/loracle-api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.path && data.base64) {
          onSend(trimmed || "Analyze this image", {
            path: data.path,
            base64: data.base64,
            mimeType: data.mimeType,
          });
        }
      } catch {
        // Upload failed — send text only
        if (trimmed) onSend(trimmed);
      } finally {
        setIsUploading(false);
      }
    } else {
      onSend(trimmed);
    }

    setValue("");
    setPendingImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
    }
  }, [value, pendingImage, onSend]);

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) setImageFromFile(file);
          return;
        }
      }
    },
    [setImageFromFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) setImageFromFile(file);
    },
    [setImageFromFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setImageFromFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [setImageFromFile]
  );

  const isInputDisabled = disabled || isStreaming || isUploading;
  const canSend = !isInputDisabled && (value.trim() || pendingImage);

  return (
    <Container
      isDragOver={isDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {previewUrl && (
        <PreviewRow>
          <Thumbnail src={previewUrl} alt="Pending upload" />
          <RemoveButton onClick={() => setPendingImage(null)}>
            Remove
          </RemoveButton>
        </PreviewRow>
      )}
      <InputRow>
        <AttachButton
          onClick={() => fileInputRef.current?.click()}
          disabled={isInputDisabled}
          title="Attach image"
        >
          +
        </AttachButton>
        <HiddenInput
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
        />
        <TextArea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder="Describe what you want to build..."
          disabled={isInputDisabled}
          rows={1}
        />
        {isStreaming ? (
          <StopButton onClick={onStop}>Stop</StopButton>
        ) : (
          <SendButton onClick={handleSend} disabled={!canSend}>
            {isUploading ? "..." : "Send"}
          </SendButton>
        )}
      </InputRow>
    </Container>
  );
};
