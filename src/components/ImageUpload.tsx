import React, { useCallback, useRef } from "react";
import { styled } from "storybook/internal/theming";

interface ImageUploadProps {
  onUpload: (imagePath: string) => void;
  disabled?: boolean;
}

const UploadButton = styled.button({
  padding: "4px 8px",
  fontSize: "11px",
  border: "1px solid #444",
  borderRadius: "4px",
  backgroundColor: "transparent",
  color: "#888",
  cursor: "pointer",
  transition: "all 0.15s",
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

export const ImageUpload: React.FC<ImageUploadProps> = ({
  onUpload,
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);

      try {
        const res = await fetch("/loracle-api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.path) {
          onUpload(data.path);
        }
      } catch {
        // Upload failed silently
      }

      // Reset input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [onUpload]
  );

  return (
    <>
      <UploadButton onClick={handleClick} disabled={disabled} title="Upload image">
        📎
      </UploadButton>
      <HiddenInput
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
      />
    </>
  );
};
