import type { Meta, StoryObj } from "@storybook/react";

const TestComponent123 = () => <div>TestComponent123</div>;

const meta: Meta<typeof TestComponent123> = {
  title: "AI Drafts/TestComponent123",
  component: TestComponent123,
};

export default meta;
type Story = StoryObj<typeof TestComponent123>;

export const Default: Story = {};
