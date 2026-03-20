# @loracle/storybook-addon

AI-powered component development inside Storybook. Chat with AI to iterate on your components without leaving Storybook.

## Installation

```bash
npx storybook@latest add @loracle/storybook-addon
```

Or install manually:

```bash
npm install @loracle/storybook-addon
```

Then add it to your `.storybook/main.ts`:

```ts
const config: StorybookConfig = {
  addons: [
    "@loracle/storybook-addon",
    // ... other addons
  ],
};

export default config;
```

## Provider Configuration

Create `.storybook/opencode.json` to configure your AI provider:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

Supported providers: `anthropic`, `openai`, `google`, `amazon-bedrock`.

If no config file is present, the addon auto-detects providers configured via [OpenCode](https://opencode.ai).

## Requirements

- Storybook 8.0+ or 9.0+
- Node.js 18+

## How It Works

The addon adds a panel to Storybook where you can chat with AI about the currently selected story. The AI can read and modify your component source code, with full undo/revert support.

## Links

- [Documentation](https://docs.getloracle.com)
- [Website](https://getloracle.com)
- [Report Issues](https://github.com/getloracle/loracle/issues)

## License

Apache-2.0
