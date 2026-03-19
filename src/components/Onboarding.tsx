import React from "react";
import { styled } from "storybook/internal/theming";

const DOCS_BASE = "https://docs.getloracle.com";

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
  maxWidth: "380px",
  lineHeight: "1.5",
});

const StepList = styled.ol({
  listStyle: "none",
  padding: 0,
  margin: 0,
  width: "100%",
  maxWidth: "400px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  counterReset: "step",
});

const StepItem = styled.li({
  counterIncrement: "step",
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  "&::before": {
    content: "counter(step)",
    flexShrink: 0,
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});

const StepContent = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
});

const StepTitle = styled.span({
  fontSize: "13px",
  fontWeight: 500,
  color: "#e0e0e0",
});

const CodeBlock = styled.pre({
  margin: 0,
  padding: "10px 12px",
  fontSize: "12px",
  fontFamily: "monospace",
  backgroundColor: "#2a2a2a",
  border: "1px solid #444",
  borderRadius: "6px",
  color: "#d4d4d4",
  overflowX: "auto",
  whiteSpace: "pre",
  lineHeight: "1.5",
});

const Link = styled.a({
  fontSize: "12px",
  color: "#6366f1",
  textDecoration: "none",
  "&:hover": {
    textDecoration: "underline",
  },
});

const Footer = styled.div({
  marginTop: "24px",
  fontSize: "12px",
  color: "#666",
  textAlign: "center",
  maxWidth: "380px",
  lineHeight: "1.5",
});

const EXAMPLE_CONFIG = `{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}`;

export const Onboarding: React.FC = () => {
  return (
    <Container data-testid="onboarding">
      <Title>Setup required</Title>
      <Subtitle>
        Create a config file so the addon knows which AI provider to use.
        Storybook will detect it automatically — no restart needed.
      </Subtitle>

      <StepList>
        <StepItem>
          <StepContent>
            <StepTitle>
              Create{" "}
              <code style={{ color: "#a5b4fc" }}>.storybook/opencode.json</code>
            </StepTitle>
            <CodeBlock>{EXAMPLE_CONFIG}</CodeBlock>
            <Link
              href={`${DOCS_BASE}/storybook-addon#configure-a-provider`}
              target="_blank"
              rel="noopener noreferrer"
            >
              See all providers (Bedrock, OpenAI, Google) →
            </Link>
          </StepContent>
        </StepItem>

        <StepItem>
          <StepContent>
            <StepTitle>Authenticate your provider</StepTitle>
            <CodeBlock>opencode auth set anthropic</CodeBlock>
            <Link
              href="https://opencode.ai/docs"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenCode docs →
            </Link>
          </StepContent>
        </StepItem>

        <StepItem>
          <StepContent>
            <StepTitle>
              Connect Loracle MCP{" "}
              <span style={{ color: "#666" }}>(optional)</span>
            </StepTitle>
            <Link
              href={`${DOCS_BASE}/storybook-addon#connect-loracle-mcp-optional`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Give the AI access to your component catalog →
            </Link>
          </StepContent>
        </StepItem>
      </StepList>

      <Footer>
        Waiting for config…
      </Footer>
    </Container>
  );
};
