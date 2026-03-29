import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { styled } from "storybook/internal/theming";

interface NewDraftDialogProps {
  onCreate: (componentName: string, description: string) => void;
  onCancel: () => void;
  serverError?: string;
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
  width: "360px",
});

const Title = styled.h3({
  fontSize: "14px",
  fontWeight: 600,
  color: "#fff",
  margin: "0 0 4px 0",
});

const Subtitle = styled.p({
  fontSize: "12px",
  color: "#888",
  margin: "0 0 12px 0",
});

const Label = styled.label({
  display: "block",
  fontSize: "11px",
  color: "#aaa",
  marginBottom: "4px",
  fontWeight: 500,
});

const Input = styled.input({
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #444",
  borderRadius: "4px",
  backgroundColor: "#111",
  color: "#fff",
  marginBottom: "4px",
  boxSizing: "border-box",
  "&:focus": {
    outline: "none",
    borderColor: "#60a5fa",
  },
});

const Textarea = styled.textarea({
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #444",
  borderRadius: "4px",
  backgroundColor: "#111",
  color: "#fff",
  marginBottom: "12px",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: "60px",
  fontFamily: "inherit",
  "&:focus": {
    outline: "none",
    borderColor: "#60a5fa",
  },
});

const Hint = styled.span({
  display: "block",
  fontSize: "10px",
  color: "#666",
  marginBottom: "10px",
});

const ErrorText = styled.span({
  display: "block",
  fontSize: "11px",
  color: "#ef4444",
  marginBottom: "10px",
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
          "&:disabled": {
            backgroundColor: "#1e3a5f",
            borderColor: "#1e3a5f",
            cursor: "not-allowed",
          },
        }
      : {
          backgroundColor: "transparent",
          borderColor: "#444",
          color: "#ccc",
          "&:hover": { borderColor: "#666" },
        }),
  })
);

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

export const NewDraftDialog: React.FC<NewDraftDialogProps> = ({
  onCreate,
  onCancel,
  serverError,
}) => {
  const [componentName, setComponentName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const validate = useCallback((name: string): string => {
    if (!name.trim()) return "";
    if (!PASCAL_CASE_RE.test(name)) return "Use PascalCase (e.g. LoginForm)";
    return "";
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setComponentName(val);
      setError(validate(val));
    },
    [validate]
  );

  const handleCreate = useCallback(() => {
    const validationError = validate(componentName);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!componentName.trim()) return;
    onCreate(componentName.trim(), description.trim());
  }, [componentName, description, validate, onCreate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate]
  );

  const isValid = componentName.trim() && !error;

  return createPortal(
    <Overlay onClick={onCancel}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <Title>New Draft Story</Title>
        <Subtitle>Create a new AI-generated component prototype.</Subtitle>

        <Label>Component Name *</Label>
        <Input
          value={componentName}
          onChange={handleNameChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g. LoginForm"
          autoFocus
        />
        {error ? <ErrorText>{error}</ErrorText> : <Hint>PascalCase, letters and numbers only</Hint>}
        {serverError && <ErrorText>{serverError}</ErrorText>}

        <Label>Initial Prompt</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what to build (optional). Generation starts automatically."
        />

        <ButtonRow>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!isValid}>
            Create
          </Button>
        </ButtonRow>
      </Dialog>
    </Overlay>,
    document.body
  );
};
