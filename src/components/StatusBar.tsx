import React, { useEffect, useState } from "react";
import { styled } from "storybook/internal/theming";
import { useLoracleApi } from "../hooks/useLoracleApi.js";

const Container = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  fontSize: "11px",
  color: "#888",
});

const LeftGroup = styled.div({
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

const StatusIndicator = styled.div<{ connected: boolean }>(({ connected }) => ({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  "&::before": {
    content: '""',
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: connected ? "#22c55e" : "#ef4444",
  },
}));

const StoryName = styled.span({
  fontWeight: 500,
  color: "#ccc",
  maxWidth: "200px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const NewDraftButton = styled.button({
  fontSize: "10px",
  padding: "2px 8px",
  border: "1px solid #22c55e",
  borderRadius: "4px",
  backgroundColor: "transparent",
  color: "#4ade80",
  cursor: "pointer",
  fontWeight: 600,
  "&:hover": { backgroundColor: "#14532d" },
});

const RightGroup = styled.div({
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

interface StatusBarProps {
  storyTitle: string | null;
  onNewDraft?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  storyTitle,
  onNewDraft,
}) => {
  const [connected, setConnected] = useState(false);
  const api = useLoracleApi();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await api.health();
      if (!cancelled) setConnected(ok);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Container>
      <LeftGroup>
        <StatusIndicator connected={connected}>
          {connected ? "Connected" : "Disconnected"}
        </StatusIndicator>
      </LeftGroup>
      <RightGroup>
        {storyTitle && <StoryName>{storyTitle}</StoryName>}
        {onNewDraft && (
          <NewDraftButton onClick={onNewDraft}>+ New</NewDraftButton>
        )}
      </RightGroup>
    </Container>
  );
};
