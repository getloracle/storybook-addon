import React, { useState, useEffect } from "react";
import { styled } from "storybook/internal/theming";

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic", hint: "console.anthropic.com" },
  { value: "openai", label: "OpenAI", hint: "platform.openai.com/api-keys" },
];

type OnboardingState = "checking" | "setup" | "connecting" | "error" | "ready";

interface OnboardingProps {
  onConnected: (provider: string) => void;
}

const Container = styled.div({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "32px",
  backgroundColor: "#1a1a1a",
  color: "#e0e0e0",
});

const Title = styled.h2({
  fontSize: "20px",
  fontWeight: 600,
  marginBottom: "8px",
  color: "#ffffff",
});

const Subtitle = styled.p({
  fontSize: "13px",
  color: "#999",
  marginBottom: "24px",
  textAlign: "center",
});

const FormGroup = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  width: "100%",
  maxWidth: "320px",
});

const Label = styled.label({
  fontSize: "12px",
  fontWeight: 500,
  color: "#ccc",
});

const Input = styled.input({
  padding: "8px 12px",
  fontSize: "13px",
  border: "1px solid #444",
  borderRadius: "6px",
  backgroundColor: "#2a2a2a",
  color: "#e0e0e0",
  outline: "none",
  "&:focus": {
    borderColor: "#6366f1",
  },
});

const Select = styled.select({
  padding: "8px 12px",
  fontSize: "13px",
  border: "1px solid #444",
  borderRadius: "6px",
  backgroundColor: "#2a2a2a",
  color: "#e0e0e0",
  outline: "none",
  "&:focus": {
    borderColor: "#6366f1",
  },
});

const Button = styled.button({
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: 500,
  border: "none",
  borderRadius: "6px",
  backgroundColor: "#6366f1",
  color: "#fff",
  cursor: "pointer",
  marginTop: "8px",
  "&:hover": {
    backgroundColor: "#5558e6",
  },
  "&:disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
});

const ErrorMessage = styled.div({
  padding: "8px 12px",
  fontSize: "12px",
  color: "#f87171",
  backgroundColor: "#2a1515",
  border: "1px solid #7f1d1d",
  borderRadius: "6px",
  width: "100%",
  maxWidth: "320px",
});

const Spinner = styled.div({
  fontSize: "13px",
  color: "#999",
  animation: "pulse 1.5s infinite",
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.5 },
  },
});

const HelpLink = styled.a({
  fontSize: "12px",
  color: "#6366f1",
  textDecoration: "none",
  marginTop: "4px",
  "&:hover": {
    textDecoration: "underline",
  },
});

export const Onboarding: React.FC<OnboardingProps> = ({ onConnected }) => {
  const [state, setState] = useState<OnboardingState>("checking");
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if provider is already configured
    fetch("/loracle-api/provider-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          onConnected(data.provider);
        } else {
          setState("setup");
        }
      })
      .catch(() => {
        setState("setup");
      });
  }, [onConnected]);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;

    setState("connecting");
    setError("");

    try {
      const res = await fetch("/loracle-api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Failed to connect. Check your API key.");
        setState("error");
        return;
      }

      onConnected(provider);
    } catch {
      setError("Connection failed. Please try again.");
      setState("error");
    }
  };

  if (state === "checking") {
    return (
      <Container data-testid="onboarding">
        <Spinner>Checking for AI provider...</Spinner>
      </Container>
    );
  }

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.value === provider);

  return (
    <Container data-testid="onboarding">
      <Title>Welcome to Loracle</Title>
      <Subtitle>Connect an AI provider to start building with AI.</Subtitle>

      <FormGroup>
        <Label>Provider</Label>
        <Select
          data-testid="provider-select"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={state === "connecting"}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <Label>API Key</Label>
        <Input
          data-testid="api-key-input"
          type="password"
          placeholder="Paste your API key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            if (state === "error") setState("setup");
          }}
          disabled={state === "connecting"}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConnect();
          }}
        />

        {selectedProvider && (
          <HelpLink
            href={`https://${selectedProvider.hint}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Don't have a key? Get one at {selectedProvider.hint}
          </HelpLink>
        )}

        {(state === "error") && error && (
          <ErrorMessage data-testid="connect-error">{error}</ErrorMessage>
        )}

        <Button
          data-testid="connect-button"
          onClick={handleConnect}
          disabled={!apiKey.trim() || state === "connecting"}
        >
          {state === "connecting" ? "Connecting..." : "Connect"}
        </Button>
      </FormGroup>
    </Container>
  );
};
