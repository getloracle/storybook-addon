import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { styled } from "storybook/internal/theming";

interface PromoteDialogProps {
  storyFilePath: string;
  onPromote: (targetDir: string) => void;
  onCancel: () => void;
}

const Overlay = styled.div({
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
});

const Dialog = styled.div({
  backgroundColor: "#1e1e1e",
  border: "1px solid #444",
  borderRadius: "8px",
  padding: "16px",
  width: "320px",
});

const Title = styled.h3({
  fontSize: "14px",
  fontWeight: 600,
  color: "#fff",
  margin: "0 0 8px 0",
});

const Description = styled.p({
  fontSize: "12px",
  color: "#888",
  margin: "0 0 12px 0",
});

const Input = styled.input({
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #444",
  borderRadius: "4px",
  backgroundColor: "#111",
  color: "#fff",
  marginBottom: "12px",
  boxSizing: "border-box",
  "&:focus": {
    outline: "none",
    borderColor: "#60a5fa",
  },
});

const ButtonRow = styled.div({
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
});

const Button = styled.button<{ variant?: "primary" | "secondary" }>(
  ({ variant = "secondary" }) => ({
    padding: "6px 12px",
    fontSize: "12px",
    border: "1px solid",
    borderRadius: "4px",
    cursor: "pointer",
    ...(variant === "primary"
      ? {
          backgroundColor: "#3b82f6",
          borderColor: "#3b82f6",
          color: "#fff",
          "&:hover": { backgroundColor: "#2563eb" },
        }
      : {
          backgroundColor: "transparent",
          borderColor: "#444",
          color: "#ccc",
          "&:hover": { borderColor: "#666" },
        }),
  })
);

export const PromoteDialog: React.FC<PromoteDialogProps> = ({
  storyFilePath,
  onPromote,
  onCancel,
}) => {
  const [targetDir, setTargetDir] = useState("src/components/");

  const handlePromote = useCallback(() => {
    if (targetDir.trim()) {
      onPromote(targetDir.trim());
    }
  }, [targetDir, onPromote]);

  return createPortal(
    <Overlay onClick={onCancel}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <Title>Promote Draft</Title>
        <Description>
          Move {storyFilePath.split("/").pop()} from __ai_drafts__ to your source
          directory.
        </Description>
        <Input
          value={targetDir}
          onChange={(e) => setTargetDir(e.target.value)}
          placeholder="Target directory (e.g. src/components/)"
        />
        <ButtonRow>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handlePromote}>
            Promote
          </Button>
        </ButtonRow>
      </Dialog>
    </Overlay>,
    document.body
  );
};
