import type { Meta, StoryObj } from "@storybook/react";
import "@vibe/core/tokens";
import { useState } from "react";
import { Button, Checkbox, TextField } from "@vibe/core";

const TestLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Email: ${email}, Password: ${password}`);
    // In a real application, you would handle authentication here
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "300px", padding: "20px", border: "1px solid #ccc", borderRadius: "8px" }}>
      <TextField
        placeholder="Email"
        value={email}
        onChange={(value: string) => setEmail(value)}
      />
      <TextField
        type="password"
        placeholder="Password"
        value={password}
        onChange={(value: string) => setPassword(value)}
      />
      <Checkbox
        checked={rememberMe}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRememberMe(e.target.checked)}
        label="Remember me"
      />
      <Button type="submit">Login</Button>
      <a href="#" style={{ textAlign: "center", marginTop: "10px", fontSize: "0.9em", color: "#0073e6" }}>Forgot password?</a>
    </form>
  );
};

const meta: Meta<typeof TestLogin> = {
  title: "AI Drafts/TestLogin",
  component: TestLogin,
};

export default meta;
type Story = StoryObj<typeof TestLogin>;

export const Default: Story = {};
