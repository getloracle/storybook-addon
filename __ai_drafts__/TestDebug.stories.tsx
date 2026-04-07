import "@vibe/core/tokens";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Flex, Heading, TextField, Button, Link, Checkbox } from "@vibe/core";

const LoginForm = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = () => {
    alert(`Logging in with: Username - ${username}, Password - ${password}`);
  };

  return (
    <Flex direction="column" gap="large" style={{ width: 300, padding: 20, border: "1px solid #ccc", borderRadius: 8 }}>
      <Heading type="h1" weight="bold">
        Login
      </Heading>
      <TextField
        title="Username"
        placeholder="Enter your username"
        value={username}
        onChange={setUsername}
      />
      <TextField
        title="Password"
        placeholder="Enter your password"
        type="password"
        value={password}
        onChange={setPassword}
      />
      <Flex justify="space-between" style={{ width: "100%" }}>
        <Checkbox
          label="Remember me"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <Link text="Forgot Password?" href="#" onClick={() => alert("Forgot Password clicked!")} />
      </Flex>
      <Button onClick={handleSubmit}>
        Login
      </Button>
    </Flex>
  );
};

const meta: Meta<typeof LoginForm> = {
  title: "AI Drafts/TestDebug",
  component: LoginForm,
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {};
