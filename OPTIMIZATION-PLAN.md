# Storybook Addon Optimization Plan

## Phase 1: Quick Optimizations (1-2 days)
**Goal: Reduce latency by 30-50% with minimal changes**

### 1.1 Cache AGENTS.md in Memory
```typescript
// In prompt-builder.ts
class PromptBuilder {
  private agentsCache: string | null = null;
  private agentsCacheTime: number = 0;
  private CACHE_TTL = 60000; // 1 minute

  private getAgentsContent(): string {
    const now = Date.now();
    if (!this.agentsCache || now - this.agentsCacheTime > this.CACHE_TTL) {
      const agentsPath = path.join(this.projectRoot, ".storybook", "AGENTS.md");
      if (fs.existsSync(agentsPath)) {
        this.agentsCache = fs.readFileSync(agentsPath, "utf-8");
        this.agentsCacheTime = now;
      }
    }
    return this.agentsCache || "";
  }
}
```

### 1.2 Pre-warm Claude Process
```typescript
// Start a "warming" process in background when Storybook loads
export async function viteFinal(config: any) {
  // Pre-spawn a Claude process to warm up the system
  const warmup = spawn("claude", ["--version"]);
  warmup.on("exit", () => {
    console.log("[loracle] System warmed up");
  });
  // ... rest
}
```

### 1.3 Optimize File Operations
- Skip staging for read-only operations
- Batch file reads where possible
- Use memory cache for frequently accessed files

### 1.4 Reduce Claude CLI Flags
```typescript
// Only include essential flags
const args = [
  "-p", prompt,
  "--output-format", "stream-json",
  "--dangerously-skip-permissions", // Skip permission prompts
  // Remove --verbose unless debugging
];
```

## Phase 2: Process Pool Implementation (3-5 days)
**Goal: Reduce latency by 70% using process reuse**

### 2.1 Simple Process Pool
```typescript
class ClaudeProcessPool {
  private maxProcesses = 3;
  private processes: Map<string, ChildProcess> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private TTL = 5 * 60 * 1000; // 5 minutes

  async getProcess(sessionId: string): Promise<ChildProcess> {
    // Reuse existing process for session if available
    if (this.processes.has(sessionId)) {
      this.lastUsed.set(sessionId, Date.now());
      return this.processes.get(sessionId)!;
    }

    // Clean up old processes
    this.cleanup();

    // Create new process
    const proc = this.spawnClaude(sessionId);
    this.processes.set(sessionId, proc);
    this.lastUsed.set(sessionId, Date.now());
    return proc;
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, time] of this.lastUsed.entries()) {
      if (now - time > this.TTL) {
        this.killProcess(id);
      }
    }
  }
}
```

### 2.2 Session Affinity
- Keep same process for same Storybook story
- Maintain conversation context in process
- Only spawn new when switching stories

## Phase 3: Hybrid Architecture (1-2 weeks)
**Goal: Best of both worlds - fast chat with tool support**

### 3.1 Direct Anthropic API for Chat
```typescript
import Anthropic from '@anthropic-ai/sdk';

class HybridClaudeAdapter {
  private anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  async sendMessage(prompt: string, sessionId: string) {
    // Use direct API for chat responses
    const stream = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      messages: this.getSessionMessages(sessionId),
      stream: true,
      tools: [
        {
          name: "edit_file",
          description: "Edit a file",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" }
            }
          }
        }
      ]
    });

    // Handle tool calls by delegating to Claude CLI
    for await (const chunk of stream) {
      if (chunk.type === 'tool_use') {
        await this.executeToolWithCLI(chunk);
      }
    }
  }

  private async executeToolWithCLI(toolCall: any) {
    // Only spawn CLI for actual tool execution
    const proc = spawn('claude', [
      '--tool', toolCall.name,
      '--input', JSON.stringify(toolCall.input)
    ]);
    // ...
  }
}
```

### 3.2 Benefits
- **Instant chat responses** (~50ms) via direct API
- **Tool support preserved** via CLI when needed
- **Best UX** - fast responses with full functionality

## Phase 4: Long-term Solution (Future)
**Goal: Full server mode**

### 4.1 Request Feature from Anthropic
- Open issue requesting `claude serve` mode
- Similar to Language Server Protocol
- Would solve all problems elegantly

### 4.2 Build Custom Server
- Fork/extend Claude CLI
- Add persistent server mode
- Contribute back to community

## Recommended Immediate Action

**Start with Phase 1 + Phase 2:**

1. **Today**: Implement memory caching (1.1) and reduce CLI flags (1.4)
   - 20-30% improvement
   - Can ship immediately

2. **This Week**: Add simple process pool (2.1)
   - 70% improvement
   - Moderate complexity

3. **Next Sprint**: Evaluate Phase 3 hybrid approach
   - 90% improvement
   - Requires API key management

## Success Metrics

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| Message latency | 320-1070ms | 200-700ms | 100-300ms | 50-150ms |
| Process spawns | Every message | Every message | Per session | Only for tools |
| Memory usage | Low | Low | Medium | Medium |
| Complexity | Simple | Simple | Moderate | Higher |

## Risk Mitigation

- **Phase 1**: No risks, just optimizations
- **Phase 2**: Test process cleanup thoroughly
- **Phase 3**: Need to handle API key securely

## Decision Point

After Phase 2, measure actual latency improvement and user feedback:
- If good enough → Stop there
- If need more speed → Proceed to Phase 3
- If Anthropic adds server mode → Migrate to that
