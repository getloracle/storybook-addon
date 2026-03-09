import React from "react";
import { styled, keyframes } from "storybook/internal/theming";
import type { GenerationPhase } from "../types.js";
import { getPhaseStatusText } from "../hooks/useChat.js";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
`;

const Container = styled.div<{ fading: boolean }>(({ fading }) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 16px",
  fontSize: "12px",
  color: "#a3a3a3",
  animation: `${fading ? fadeOut : fadeIn} ${fading ? "0.4s" : "0.2s"} ease ${fading ? "forwards" : ""}`,
}));

const Dot = styled.span({
  display: "inline-block",
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  backgroundColor: "#3b82f6",
  animation: `${pulse} 1.4s ease-in-out infinite`,
});

const Checkmark = styled.span({
  color: "#22c55e",
  fontSize: "14px",
  lineHeight: 1,
});

interface ActivityStatusProps {
  phase: GenerationPhase;
}

export const ActivityStatus: React.FC<ActivityStatusProps> = ({ phase }) => {
  if (phase === "idle" || phase === "error") return null;

  const text = getPhaseStatusText(phase);
  const isDone = phase === "done";

  return (
    <Container fading={isDone}>
      {isDone ? <Checkmark>&#10003;</Checkmark> : <Dot />}
      <span>{text}</span>
    </Container>
  );
};
