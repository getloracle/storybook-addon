import type { Meta, StoryObj } from "@storybook/react";

const TestDebug = () => <div>TestDebug</div>;

const meta: Meta<typeof TestDebug> = {
  title: "AI Drafts/TestDebug",
  component: TestDebug,
};

export default meta;
type Story = StoryObj<typeof TestDebug>;

export const Default: Story = {};
