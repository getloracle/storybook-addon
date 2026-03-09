# Loracle Storybook Addon: OpenCode Migration

## Problem

The addon currently spawns a new Claude CLI process for every user message. This has two problems:

1. **Locked to Claude Code** - users must have Claude Code installed. Users with Codex, Cursor, or no coding agent at all can't use the addon.
2. **Architecture** - spawning a process per message is fundamentally wrong. It works, but it's a hack.

## Solution

Replace Claude CLI with OpenCode as the agent backend. OpenCode runs as a persistent local HTTP server, supports any LLM provider, and ships as an npm dependency - not a global install.

The user doesn't know OpenCode exists. They install the addon, paste an API key (if needed), and start building.

## Non-Goals

- Building our own coding agent
- Managing API keys on our servers
- Handling security/privacy of user code (OpenCode runs locally)
- Supporting OpenCode's TUI - we only use it as a headless server

---

## User Experience

### Install

A developer (or someone setting up the project) adds the addon:

```bash
npm install @loracle/storybook-addon
```

```typescript
// .storybook/main.ts
addons: ['@loracle/storybook-addon']
```

OpenCode is an npm dependency of the addon. Nothing else to install.

### First Launch

User runs `npm run storybook`, opens the Loracle panel.

**Auto-detection runs silently:**
- `ANTHROPIC_API_KEY` in env? Use it.
- `OPENAI_API_KEY` in env? Use it.
- AWS credentials present? Use Bedrock.
- `GOOGLE_APPLICATION_CREDENTIALS`? Use Vertex.
- OpenCode already configured from a previous session? Use it.

If any of these succeed: skip straight to chat. No onboarding screen.

**If nothing is detected**, show the setup screen:

```
Welcome to Loracle

Connect an AI provider to start building with AI.

API Key: [____________________________]

Provider: [Anthropic     v]

[Connect]

Don't have a key? Get one at console.anthropic.com
```

One field. One dropdown. One button.

User pastes key, clicks Connect. The addon stores it via OpenCode's SDK. Screen transitions to chat.

### Building

User sees the chat panel. Types a message. The agent responds, edits files, Storybook preview updates via HMR. Standard flow - same as today, just faster and provider-agnostic.

### Every Launch After

Storybook starts. Panel opens. Chat is ready. Zero steps.

### Settings

Accessible from a gear icon in the panel header:

```
Provider: [Anthropic     v]
Model:    [Claude Sonnet  v]

[Update API Key]
[Disconnect]
```

User can change provider or model at any time. This is a nice-to-have, not launch-critical.

---

## High Level Design

### Architecture

```
Browser (Storybook Manager)
    |
    | Storybook Channel Events
    v
Addon Panel (React)
    |
    | HTTP / SSE
    v
Addon Middleware (Vite plugin, runs in Storybook server process)
    |
    | OpenCode SDK (@opencode-ai/sdk)
    v
OpenCode Server (child process, localhost:4096)
    |
    | Provider API (Anthropic, OpenAI, Bedrock, etc.)
    v
LLM
```

### Components

**1. OpenCode Lifecycle Manager**

Owns starting, health-checking, and stopping the OpenCode server process.

```
Location: packages/storybook-addon/src/server/opencode-lifecycle.ts

Responsibilities:
- Start `opencode serve` as child process on Storybook boot
- Health check via GET /global/health
- Restart on crash
- Graceful shutdown when Storybook exits
- Port management (find available port if 4096 is taken)
```

**2. Provider Detector**

Auto-detects existing credentials from the environment.

```
Location: packages/storybook-addon/src/server/provider-detector.ts

Checks (in order):
1. OpenCode already has a provider configured (GET /config/providers)
2. ANTHROPIC_API_KEY env var
3. OPENAI_API_KEY env var
4. AWS credential chain (~/.aws/credentials, AWS_PROFILE, etc.)
5. GOOGLE_APPLICATION_CREDENTIALS env var

If found: calls OpenCode SDK auth.set() to configure
Returns: { configured: boolean, provider: string, model: string } | null
```

**3. OpenCode Adapter**

Replaces ClaudeCodeAdapter. Talks to OpenCode server via SDK.

```
Location: packages/storybook-addon/src/server/opencode-adapter.ts

Interface (same as current CodingAgent abstraction):
- createSession(storyId: string): Promise<string>
- sendMessage(sessionId: string, prompt: string): AsyncIterable<StreamEvent>
- kill(sessionId: string): void

Implementation:
- Maps storyId to OpenCode session
- Calls client.session.prompt() for messages
- Streams responses via SSE subscription
- Maps OpenCode events to existing StreamEvent types
```

**4. Onboarding UI**

React component shown when no provider is detected.

```
Location: packages/storybook-addon/src/components/Onboarding.tsx

States:
- "checking" - detecting provider (spinner)
- "setup" - show API key form
- "connecting" - validating key (spinner)
- "error" - invalid key, show message
- "ready" - transition to chat

Props:
- onConnected: (provider: string) => void
```

**5. Middleware (Updated)**

Existing middleware gains two new endpoints, loses Claude CLI dependency.

```
New endpoints:
- GET  /loracle-api/provider-status  → { configured, provider, model }
- POST /loracle-api/connect          → { provider, apiKey } → configure OpenCode

Changed:
- POST /loracle-api/prompt           → uses OpenCodeAdapter instead of ClaudeCodeAdapter
- GET  /loracle-api/stream/:id       → same SSE interface, different backend

Removed:
- ClaudeCodeAdapter import
- All claude CLI spawning logic
```

### Data Flow: Sending a Message

```
1. User types message, clicks Send
2. useChat hook calls POST /loracle-api/prompt { prompt, storyId }
3. Middleware calls GenerationManager.startGeneration()
4. GenerationManager calls OpenCodeAdapter.sendMessage()
5. OpenCodeAdapter calls client.session.prompt({ parts: [{ type: "text", text: prompt }] })
6. OpenCode server processes the request (calls LLM, executes tools)
7. Responses stream back via OpenCode SDK
8. OpenCodeAdapter maps events to StreamEvent format
9. GenerationManager fans out to SSE listeners
10. Browser receives SSE events, useChat hook updates UI
```

### What Changes vs. What Stays

```
STAYS THE SAME:
- useChat hook
- ChatPanel component
- MessageList component
- StreamEvent types
- GenerationManager (mostly)
- Middleware routing
- Session store (file-based)
- Staging file logic
- Prompt builder (adapted)

CHANGES:
- ClaudeCodeAdapter  --> OpenCodeAdapter
- preset.ts          --> also starts OpenCode server
- Package deps       --> add @opencode-ai/sdk, opencode

NEW:
- OpenCode Lifecycle Manager
- Provider Detector
- Onboarding UI component
- /provider-status endpoint
- /connect endpoint

REMOVED:
- cli-adapter.ts (ClaudeCodeAdapter)
- All `spawn("claude", ...)` calls
```

### Configuration

The addon accepts optional config in `.storybook/main.ts`:

```typescript
addons: [{
  name: '@loracle/storybook-addon',
  options: {
    // All optional. Defaults work for most users.
    provider: 'anthropic',           // Override auto-detection
    model: 'claude-sonnet-4-20250514', // Override default model
    openCodePort: 4096,              // Override port
  }
}]
```

Environment variables also work:

```bash
LORACLE_PROVIDER=anthropic
LORACLE_MODEL=claude-sonnet-4-20250514
```

### OpenCode as Dependency

```json
{
  "name": "@loracle/storybook-addon",
  "dependencies": {
    "@opencode-ai/sdk": "^1.0.0",
    "opencode": "^1.0.0"
  }
}
```

The addon starts OpenCode from `node_modules/.bin/opencode`, not a global install. The user never installs OpenCode themselves.

### System Prompt / Agent Instructions

The existing AGENTS.md template still works. It gets passed to OpenCode via the prompt:

```typescript
const prompt = `
<system_instructions>
${agentsMdContent}
</system_instructions>

<current_story_file path="${storyFilePath}">
${fileContent}
</current_story_file>

${userPrompt}
`;
```

OpenCode's agent handles the rest - reading files, running bash, exploring types, editing code.

---

## Phases

### Phase 1: Core Migration

Replace Claude CLI with OpenCode. Ship with API key onboarding.

- OpenCode lifecycle manager
- OpenCode adapter
- Provider detector (env var auto-detection)
- Onboarding screen (API key input)
- Update middleware endpoints

Result: Everything works. Users paste an API key or have one in their env.

### Phase 2: Polish

- Settings panel (change provider/model)
- Better error messages (invalid key, rate limit, network issues)
- Provider-specific onboarding hints ("Get a key at console.anthropic.com")
- Connection status indicator in panel header

### Phase 3: Enterprise

- OAuth flow for Claude Pro/Max (via OpenCode's OAuth endpoints)
- Bedrock auto-detection with region/profile picker
- Team-level config via `.storybook/main.ts` (so individual devs don't need to configure)

---

## Risks

| Risk | Mitigation |
|------|-----------|
| OpenCode has breaking API changes | Pin SDK version, test on upgrade |
| OpenCode server crashes | Lifecycle manager auto-restarts |
| Port 4096 is taken | Auto-find available port |
| User's API key is invalid | Validate on connect, show clear error |
| OpenCode is slow to start | Show "Starting..." state, health check polling |
| npm dependency size | Evaluate, consider optional peer dep if too large |

## Success Metrics

- Time from install to first message: < 2 minutes
- Users who complete onboarding: > 90%
- Zero mentions of "OpenCode" in user-facing UI
- Works with Anthropic, OpenAI, and Bedrock on day one

---

## Acceptance Criteria & E2E Verification

### AC1: OpenCode Server Starts Automatically

**Criteria**: When Storybook starts, the OpenCode server process starts as a child process without any user action. The server is healthy and reachable before the addon panel renders.

**Verify**:
1. Remove any globally installed OpenCode (`npm uninstall -g opencode`)
2. Run `npm run storybook`
3. In a separate terminal, run `curl http://localhost:4096/global/health`
4. Expect: `200 OK` with version info
5. Kill Storybook (`Ctrl+C`)
6. Run `curl http://localhost:4096/global/health` again
7. Expect: connection refused (server stopped with Storybook)

### AC2: OpenCode Server Recovers From Crash

**Criteria**: If the OpenCode server process dies unexpectedly, the lifecycle manager restarts it within 5 seconds.

**Verify**:
1. Start Storybook
2. Find the OpenCode process: `ps aux | grep opencode`
3. Kill it: `kill -9 <pid>`
4. Wait 5 seconds
5. Run `curl http://localhost:4096/global/health`
6. Expect: `200 OK` (server restarted)
7. Open addon panel - it should work normally, no error state

### AC3: Auto-Detect Anthropic API Key

**Criteria**: If `ANTHROPIC_API_KEY` is set in the environment, the addon auto-configures the provider and shows the chat UI immediately. No onboarding screen.

**Verify**:
1. Clear any previous OpenCode auth: `rm -rf ~/.local/share/opencode/auth.json`
2. Run `ANTHROPIC_API_KEY=sk-ant-test123 npm run storybook`
3. Open the Loracle panel
4. Expect: chat UI shown directly, no onboarding screen
5. Check provider status: `curl http://localhost:4096/config/providers`
6. Expect: Anthropic listed as configured provider

### AC4: Auto-Detect OpenAI API Key

**Criteria**: Same as AC3 but for OpenAI.

**Verify**:
1. Clear any previous OpenCode auth
2. Run `OPENAI_API_KEY=sk-test123 npm run storybook`
3. Open the Loracle panel
4. Expect: chat UI shown directly, no onboarding screen
5. Expect: OpenAI listed as configured provider

### AC5: Auto-Detect AWS Bedrock

**Criteria**: If AWS credentials are present and valid, the addon auto-configures Bedrock.

**Verify**:
1. Clear any previous OpenCode auth
2. Ensure `~/.aws/credentials` exists with a valid profile
3. Run `AWS_PROFILE=my-profile npm run storybook`
4. Open the Loracle panel
5. Expect: chat UI shown directly, no onboarding screen
6. Expect: Amazon Bedrock listed as configured provider

### AC6: Onboarding Screen Shown When No Credentials Found

**Criteria**: When no environment variables or prior config exist, the addon shows the onboarding screen with an API key field, provider dropdown, and Connect button.

**Verify**:
1. Clear any previous OpenCode auth
2. Unset all provider env vars: `unset ANTHROPIC_API_KEY OPENAI_API_KEY AWS_PROFILE`
3. Run `npm run storybook`
4. Open the Loracle panel
5. Expect: onboarding screen with:
   - "Welcome to Loracle" heading
   - API key input field
   - Provider dropdown (Anthropic selected by default)
   - Connect button
   - Help link for getting a key

### AC7: Manual API Key Connect Flow

**Criteria**: User can paste an API key, select a provider, click Connect, and transition to the chat UI.

**Verify (Playwright)**:
```typescript
// Open Storybook with no env vars set
await page.goto('http://localhost:6006');
await page.click('[data-testid="loracle-panel-tab"]');

// Onboarding screen visible
await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();

// Fill in API key
await page.fill('[data-testid="api-key-input"]', 'sk-ant-valid-key');

// Select provider
await page.selectOption('[data-testid="provider-select"]', 'anthropic');

// Click connect
await page.click('[data-testid="connect-button"]');

// Wait for transition
await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 10000 });

// Onboarding gone
await expect(page.locator('[data-testid="onboarding"]')).not.toBeVisible();
```

### AC8: Invalid API Key Shows Error

**Criteria**: If the user pastes an invalid key and clicks Connect, they see an error message. They are not sent to the chat UI.

**Verify (Playwright)**:
```typescript
await page.fill('[data-testid="api-key-input"]', 'invalid-key');
await page.click('[data-testid="connect-button"]');

// Error message shown
await expect(page.locator('[data-testid="connect-error"]')).toBeVisible();
await expect(page.locator('[data-testid="connect-error"]')).toContainText(/invalid|unauthorized/i);

// Still on onboarding screen
await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();
```

### AC9: Send Message and Receive Streaming Response

**Criteria**: User sends a message from the chat panel. The response streams in progressively. The message appears in the chat history when complete.

**Verify (Playwright)**:
```typescript
// Assumes provider is already configured
await page.goto('http://localhost:6006/?path=/story/ui-button--default');
await page.click('[data-testid="loracle-panel-tab"]');
await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();

// Type and send message
await page.fill('[data-testid="chat-input"]', 'Add a red border to this button');
await page.click('[data-testid="send-button"]');

// User message appears
await expect(page.locator('[data-testid="message-user"]').last()).toContainText('Add a red border');

// Streaming indicator appears
await expect(page.locator('[data-testid="activity-status"]')).toBeVisible();

// Wait for assistant response to complete (up to 60s for LLM + tool use)
await expect(page.locator('[data-testid="message-assistant"]').last()).toBeVisible({ timeout: 60000 });

// Streaming indicator gone
await expect(page.locator('[data-testid="activity-status"]')).not.toBeVisible({ timeout: 10000 });
```

### AC10: Agent Edits Files and Storybook Preview Updates

**Criteria**: When the agent edits a story file, Storybook's HMR picks up the change and the preview iframe re-renders.

**Verify (Playwright)**:
```typescript
await page.goto('http://localhost:6006/?path=/story/ui-button--default');
await page.click('[data-testid="loracle-panel-tab"]');

// Get initial preview content
const previewFrame = page.frameLocator('[id="storybook-preview-iframe"]');
const initialHTML = await previewFrame.locator('#storybook-root').innerHTML();

// Send a prompt that changes the component
await page.fill('[data-testid="chat-input"]', 'Change the button text to "Click Me Now"');
await page.click('[data-testid="send-button"]');

// Wait for response to complete
await expect(page.locator('[data-testid="message-assistant"]').last()).toBeVisible({ timeout: 60000 });

// Preview should have updated
await expect(previewFrame.locator('#storybook-root')).not.toHaveInnerHTML(initialHTML, { timeout: 15000 });
```

### AC11: Conversation Persists Across Page Reloads

**Criteria**: If the user reloads Storybook, previous messages for a story are still visible in the chat panel.

**Verify (Playwright)**:
```typescript
// Send a message
await page.fill('[data-testid="chat-input"]', 'Hello');
await page.click('[data-testid="send-button"]');
await expect(page.locator('[data-testid="message-assistant"]').last()).toBeVisible({ timeout: 60000 });

// Count messages
const messageCount = await page.locator('[data-testid^="message-"]').count();

// Reload
await page.reload();
await page.click('[data-testid="loracle-panel-tab"]');

// Same messages visible
await expect(page.locator('[data-testid^="message-"]')).toHaveCount(messageCount);
```

### AC12: Stop Generation

**Criteria**: User can stop an in-progress generation. The agent stops, the UI returns to idle, and the user can send a new message.

**Verify (Playwright)**:
```typescript
// Send a long prompt
await page.fill('[data-testid="chat-input"]', 'Write a complete dashboard component with 10 widgets');
await page.click('[data-testid="send-button"]');

// Wait for streaming to start
await expect(page.locator('[data-testid="activity-status"]')).toBeVisible();

// Click stop
await page.click('[data-testid="stop-button"]');

// UI returns to idle
await expect(page.locator('[data-testid="activity-status"]')).not.toBeVisible({ timeout: 5000 });

// Can send a new message
await page.fill('[data-testid="chat-input"]', 'Hello again');
await expect(page.locator('[data-testid="send-button"]')).toBeEnabled();
```

### AC13: Provider Config Persists Across Storybook Restarts

**Criteria**: After configuring a provider once, restarting Storybook does not require reconfiguration.

**Verify**:
1. Start Storybook with no env vars
2. Configure provider via onboarding screen
3. Verify chat works
4. Stop Storybook (`Ctrl+C`)
5. Start Storybook again (no env vars)
6. Open Loracle panel
7. Expect: chat UI shown directly, no onboarding screen

### AC14: No Reference to "OpenCode" in UI

**Criteria**: The words "OpenCode" or "opencode" never appear in any user-facing UI element - panel, onboarding, errors, settings.

**Verify**:
1. Start Storybook
2. Open Loracle panel
3. Go through onboarding flow
4. Send a message, trigger an error (e.g., rate limit)
5. Open browser DevTools, search all visible DOM text for "opencode" (case-insensitive)
6. Expect: zero matches

### AC15: Port Conflict Handling

**Criteria**: If port 4096 is already in use, the addon finds another available port and starts the OpenCode server there.

**Verify**:
1. Block port 4096: `python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',4096)); s.listen(); input()" &`
2. Run `npm run storybook`
3. Open Loracle panel
4. Expect: addon works normally (chat is functional)
5. Check logs: should indicate alternative port was used

### AC16: Multiple Storybook Instances

**Criteria**: Running two Storybook instances simultaneously does not cause conflicts. Each gets its own OpenCode server or shares one safely.

**Verify**:
1. Start Storybook in project A on port 6006
2. Start Storybook in project B on port 6007
3. Open both in browser
4. Send a message in project A - expect response
5. Send a message in project B - expect response
6. Messages do not cross between projects

### AC17: Latency Improvement

**Criteria**: Time from clicking Send to receiving the first streamed token is under 2 seconds (excluding LLM thinking time on complex prompts). This is measured from the HTTP request to the first SSE text event, not total generation time.

**Verify**:
```typescript
// Instrument the middleware to log timing
const start = Date.now();
const firstTokenTime = null;

api.streamGeneration(generationId, (event) => {
  if (event.type === 'text' && !firstTokenTime) {
    firstTokenTime = Date.now();
    console.log(`Time to first token: ${firstTokenTime - start}ms`);
  }
});

// Send a simple prompt like "Say hello"
// Expect: time to first token < 2000ms
// Compare with Claude CLI baseline (capture before migration)
```
