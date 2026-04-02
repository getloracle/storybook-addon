# @loracle/storybook-addon

Chat with AI to build and refine components — without leaving Storybook.

![Loracle addon panel in Storybook](docs-screenshots/final/chat-panel-overview.png)

Describe what you want. The AI edits the story file. Storybook hot-reloads with the result.

## Why

- **Uses your existing AI subscription** — works with Claude Code, Codex, Gemini, Bedrock, and more through [OpenCode](https://opencode.ai). No new account or API key required.
- **Chat panel inside Storybook** — open the Loracle tab in the bottom panel and start prompting.
- **Screenshot to story** — paste a screenshot or design mockup and the AI recreates it as a story using your design system components.
- **Full undo/revert** — every message snapshots your code. Restore any previous state with one click.
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

The addon runs on [OpenCode](https://opencode.ai) and connects to your existing AI provider subscription. If OpenCode already has a provider configured, the addon picks it up automatically — zero setup.

To configure a specific provider, create `.storybook/opencode.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

Supported providers: `anthropic`, `openai`, `google`, `amazon-bedrock`.

See the [OpenCode provider guide](https://opencode.ai/docs/providers) for authentication setup for all supported providers.

## Requirements

- Storybook 8.0+ or 9.0+
- Node.js 18+

## Documentation

- [Full guide](https://docs.getloracle.com/storybook-addon)
- [MCP server](https://docs.getloracle.com/mcp) — connect your coding agent to the published catalog
- [Loracle CLI](https://docs.getloracle.com/cli) — publish your design system

## Links

- [Website](https://getloracle.com)
- [Report Issues](https://github.com/getloracle/loracle/issues)

## License

Apache-2.0
