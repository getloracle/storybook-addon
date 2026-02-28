import React from "react";
import { styled } from "storybook/internal/theming";
import type { TimelineTurn } from "../hooks/useTimeline.js";

interface TimelineProps {
  turns: TimelineTurn[];
  onRevert: (turnIndex: number) => void;
}

const Container = styled.div({
  padding: "8px 12px",
  borderBottom: "1px solid #333",
});

const Label = styled.div({
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  marginBottom: "6px",
});

const TurnList = styled.div({
  display: "flex",
  gap: "4px",
  flexWrap: "wrap",
});

const TurnChip = styled.button<{ hasSnapshot: boolean }>(({ hasSnapshot }) => ({
  padding: "2px 8px",
  fontSize: "11px",
  border: "1px solid #444",
  borderRadius: "12px",
  backgroundColor: hasSnapshot ? "#1e293b" : "#111",
  color: hasSnapshot ? "#93c5fd" : "#666",
  cursor: hasSnapshot ? "pointer" : "default",
  transition: "all 0.15s",
  "&:hover": hasSnapshot
    ? { backgroundColor: "#1e3a5f", borderColor: "#60a5fa" }
    : {},
}));

export const Timeline: React.FC<TimelineProps> = ({ turns, onRevert }) => {
  if (turns.length === 0) return null;

  return (
    <Container>
      <Label>Timeline</Label>
      <TurnList>
        {turns.map((turn) => (
          <TurnChip
            key={turn.index}
            hasSnapshot={turn.hasSnapshot}
            onClick={() => turn.hasSnapshot && onRevert(turn.index)}
            title={
              turn.hasSnapshot
                ? `Revert to turn ${turn.index + 1}: "${turn.userMessage.slice(0, 50)}"`
                : `Turn ${turn.index + 1} (no snapshot)`
            }
          >
            {turn.index + 1}
          </TurnChip>
        ))}
      </TurnList>
    </Container>
  );
};
