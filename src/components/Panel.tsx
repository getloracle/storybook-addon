import React from "react";
import { AddonPanel } from "storybook/internal/components";
import { ChatPanel } from "./ChatPanel.js";

export const Panel: React.FC<{ active?: boolean }> = ({ active = false }) => {
  return (
    <AddonPanel active={active}>
      <ChatPanel active={active} />
    </AddonPanel>
  );
};
