# @loracle-js/storybook-addon

Chat with AI to build and refine components — without leaving Storybook.

![Loracle addon panel in Storybook](docs-screenshots/final/chat-panel-overview.png)

Describe what you want. The AI edits the story file. Storybook hot-reloads with the result.

## Why

- **Uses your existing AI subscription** — works with Anthropic, OpenAI, Google, and Amazon Bedrock through [OpenCode](https://opencode.ai). No new account or API key required.
- **Chat panel inside Storybook** — open the Loracle tab in the bottom panel and start prompting.
- **Image to story** — paste a screenshot or design mockup directly into the chat and the AI recreates it as a story using your components.
- **Full undo/revert** — every message snapshots your code. Restore any previous state with one click.
- **Draft stories** — scaffold new AI-generated components from scratch without touching any existing files.
- **Safe by default** — the AI can only write to `*.stories.*` files. Bash, web fetch, and other destructive tools are disabled.

## Quick start

```bash
npx storybook@latest add @loracle-js/storybook-addon
```

Or install manually:

```bash
npm install @loracle-js/storybook-addon
```

Then add it to your `.storybook/main.ts`:

```ts
const config: StorybookConfig = {
  addons: [
    "@loracle-js/storybook-addon",
    // ... other addons
  ],
};

export default config;
```

Start Storybook and open the **Loracle** tab in the bottom panel.

## Connect your AI provider

The addon runs on [OpenCode](https://opencode.ai) and connects to your existing AI provider. Create `.storybook/opencode.json` to configure it:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

Then authenticate the provider:

```bash
opencode auth set anthropic
```

If OpenCode already has a provider configured globally, the addon picks it up automatically — no config file needed.

Supported providers: `anthropic`, `openai`, `google`, `amazon-bedrock`. See the [OpenCode provider docs](https://opencode.ai/docs) for authentication details.

## Features

### Chat panel

Open the **Loracle** tab in Storybook's bottom panel. The chat is scoped to the currently selected story — navigate to a story, type a prompt, and the AI edits that story's source file directly. Storybook reloads when the AI is done writing.

Chat history for each story is saved to `.storybook/ai-sessions/` and restored automatically on restart.

### Image attachment

Attach images to your prompts in three ways:

- **Paste** — copy an image to your clipboard and paste it into the chat input
- **Drag and drop** — drag an image file onto the chat input
- **File picker** — click the `+` button to browse for an image

The AI receives the image alongside your prompt and uses it as a visual reference. This works well for recreating UI mockups or matching a design screenshot.

### Undo / revert

Every prompt you send saves a snapshot of the story file before the AI makes changes. To restore a previous state, click the **Restore** button next to any of your messages in the chat. The file is written back atomically and Storybook reloads.

### Draft stories

Click **+ New** in the panel header to create a new AI-generated story from scratch. Enter a component name (PascalCase) and an optional description of what to build. The addon creates a scaffold file in `__ai_drafts__/`, navigates to it, and kicks off generation automatically.

Draft story files live in `__ai_drafts__/` at your project root. You can move them into your main stories directory when you're happy with the result.

### Loracle MCP (optional)

Connect the [Loracle MCP server](https://docs.getloracle.com/mcp) to give the AI access to your published component catalog. When configured, the AI can look up your real components and use them in generated stories instead of creating placeholder code.

Add the MCP config to `.storybook/opencode.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "mcp": {
    "loracle": {
      "type": "sse",
      "url": "https://mcp.getloracle.com/sse"
    }
  }
}
```

### Custom system instructions (AGENTS.md)

Create `.storybook/AGENTS.md` to add custom instructions that are prepended to every prompt. Use this to tell the AI about your design system conventions, naming patterns, preferred libraries, or anything else relevant to your project.

```markdown
# Design system instructions

- Use the `Button` component from `@myapp/ui` for all buttons
- Follow the spacing scale: 4, 8, 16, 24, 32px
- All colors must come from the theme tokens
```

### Advanced OpenCode configuration

For full control, you can also place an `opencode.json` at your project root using the standard [OpenCode configuration format](https://opencode.ai/docs). The addon merges this with `.storybook/opencode.json`, with the `.storybook/` file taking precedence for provider and model settings.

To override the default security restrictions (writes locked to `*.stories.*` only), add a `permission` key to `.storybook/opencode.json`. See the [OpenCode permission docs](https://opencode.ai/docs) for the format.

## Requirements

- Storybook 8.0+ or 9.0+
- Node.js 18+
- React framework (Vue/Svelte support planned)

## How it works

The addon embeds an OpenCode server inside the Storybook Vite dev server. When you send a prompt, the server:

1. Builds a prompt that includes the current story file contents and any chat history
2. Sends it to OpenCode, which calls the AI model with file-editing tools
3. Streams events back to the panel (text, tool calls, completion)
4. Suppresses Vite HMR while the file is being written
5. Triggers a full page reload once writing is complete

All API routes are served under `/loracle-api/` and restricted to `localhost` only.

## Documentation

- [Full guide](https://docs.getloracle.com/storybook-addon)
- [MCP server](https://docs.getloracle.com/mcp) — connect your coding agent to the published catalog
- [Loracle CLI](https://docs.getloracle.com/cli) — publish your design system

## Links

- [Website](https://getloracle.com)
- [Report Issues](https://github.com/getloracle/storybook-addon/issues)

## License

Apache-2.0
