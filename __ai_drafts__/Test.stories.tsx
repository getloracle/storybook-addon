import type { Meta, StoryObj } from "@storybook/react";

const Test = () => <div>Test</div>;

const meta: Meta<typeof Test> = {
  title: "AI Drafts/Test",
  component: Test,
};

export default meta;
type Story = StoryObj<typeof Test>;

export const Default: Story = {};
