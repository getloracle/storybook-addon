import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";
import { Button } from "./Button";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: { title: "Welcome", description: "This is a simple card component." },
};

export const WithAction: Story = {
  args: { title: "Confirm", description: "Are you sure?" },
  render: (args) => (
    <Card {...args}>
      <Button variant="primary">Confirm</Button>
    </Card>
  ),
};

export const NoBorder: Story = {
  args: { title: "Borderless", description: "A card without a border.", bordered: false },
};
