# Hot Claude Instance Patterns

## Pattern 1: Session Resume (Currently Possible)
**Use Claude's built-in `--resume` flag to maintain conversation state**

```typescript
class ClaudeSessionManager {
  private sessions = new Map<string, string>(); // storyId -> cliSessionId

  async sendMessage(storyId: string, prompt: string) {
    const existingSession = this.sessions.get(storyId);

    // First message: start new session
    if (!existingSession) {
      const proc = spawn('claude', [
        '-p', prompt,
        '--output-format', 'stream-json'
      ]);

      // Extract session ID from response
      const sessionId = await this.extractSessionId(proc);
      this.sessions.set(storyId, sessionId);
      return proc;
    }

    // Subsequent messages: resume session
    // This is "warm" in that context is preserved, but process still restarts
    const proc = spawn('claude', [
      '-p', prompt,
      '--resume', existingSession,  // ← Resume previous conversation
      '--output-format', 'stream-json'
    ]);

    return proc;
  }
}
```

**Pros:**
- Works today with current Claude CLI
- Maintains conversation context
- Simple implementation

**Cons:**
- Still spawns new process (100-500ms overhead)
- Not truly "hot" - just stateful

## Pattern 2: Long-Running with Named Pipes (Unix/Linux/Mac)
**Keep process alive using FIFOs for communication**

```typescript
import { mkfifoSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';

class HotClaudeInstance {
  private process: ChildProcess;
  private inputPipe: string;
  private outputPipe: string;
  private sessionId: string;

  constructor(id: string) {
    this.sessionId = id;
    this.inputPipe = `/tmp/claude-input-${id}`;
    this.outputPipe = `/tmp/claude-output-${id}`;

    // Create named pipes
    try {
      mkfifoSync(this.inputPipe);
      mkfifoSync(this.outputPipe);
    } catch (e) {
      // Pipes might already exist
    }
  }

  async start() {
    // Hypothetical: if Claude supported reading from pipe
    this.process = spawn('claude', [
      '--input-pipe', this.inputPipe,
      '--output-pipe', this.outputPipe,
      '--interactive'  // Doesn't exist yet
    ]);
  }

  async sendMessage(prompt: string): Promise<string> {
    // Write to input pipe
    const writeStream = fs.createWriteStream(this.inputPipe);
    writeStream.write(JSON.stringify({ prompt }) + '\n');
    writeStream.end();

    // Read from output pipe
    const readStream = fs.createReadStream(this.outputPipe);
    return new Promise((resolve) => {
      let data = '';
      readStream.on('data', chunk => data += chunk);
      readStream.on('end', () => resolve(data));
    });
  }

  cleanup() {
    this.process?.kill();
    unlinkSync(this.inputPipe);
    unlinkSync(this.outputPipe);
  }
}
```

**Problem:** Claude CLI doesn't support this mode.

## Pattern 3: Process Pool with Pre-warming
**Spawn processes ahead of time, ready to use**

```typescript
class ClaudeProcessPool {
  private available: ChildProcess[] = [];
  private busy = new Map<string, ChildProcess>();
  private sessionMap = new Map<string, string>(); // storyId -> cliSessionId

  constructor(private poolSize = 3) {}

  async initialize() {
    // Pre-spawn processes in "standby" mode
    for (let i = 0; i < this.poolSize; i++) {
      await this.spawnStandbyProcess();
    }
  }

  private async spawnStandbyProcess() {
    // Spawn with minimal prompt to initialize
    const proc = spawn('claude', [
      '-p', 'You are ready. Wait for instructions.',
      '--output-format', 'stream-json'
    ]);

    // Extract session ID
    const sessionId = await this.extractSessionId(proc);

    // Store process with its session
    this.available.push({
      process: proc,
      sessionId: sessionId,
      warmedAt: Date.now()
    });
  }

  async acquireProcess(storyId: string): Promise<ChildProcess> {
    // Check if story already has a session
    const existingSessionId = this.sessionMap.get(storyId);

    if (existingSessionId) {
      // Resume existing session (still need new process though)
      return spawn('claude', [
        '--resume', existingSessionId,
        '--output-format', 'stream-json'
      ]);
    }

    // Get pre-warmed process
    const warmed = this.available.pop();
    if (!warmed) {
      // Pool exhausted, spawn new
      return this.spawnNewProcess();
    }

    // Map story to this session
    this.sessionMap.set(storyId, warmed.sessionId);

    // Spawn new standby process in background
    this.spawnStandbyProcess();

    return warmed.process;
  }
}
```

## Pattern 4: Hack - Keep Process Alive with Continuous Input
**Feed the process to keep it from exiting**

```typescript
class PersistentClaudeHack {
  private process: ChildProcess;
  private messageQueue: string[] = [];
  private processing = false;

  async start() {
    // Start Claude with a special prompt that makes it wait
    this.process = spawn('claude', [
      '-p', 'You are an assistant. I will send you multiple messages. After each response, say "READY_FOR_NEXT" and wait.',
      '--output-format', 'stream-json'
    ]);

    // Don't close stdin!
    // Keep process alive by not ending input stream
  }

  async sendMessage(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      // Write to stdin without closing it
      this.process.stdin.write(
        `New message: ${prompt}\nRespond, then say READY_FOR_NEXT\n`
      );

      let response = '';
      const handler = (chunk: Buffer) => {
        const text = chunk.toString();
        response += text;

        if (response.includes('READY_FOR_NEXT')) {
          this.process.stdout.removeListener('data', handler);
          resolve(response.replace('READY_FOR_NEXT', ''));
        }
      };

      this.process.stdout.on('data', handler);
    });
  }
}
```

**Problem:** Claude CLI likely closes after first response regardless.

## Pattern 5: The Reality - Wrapper Service
**Accept that we need a wrapper that manages Claude instances**

```typescript
class ClaudeInstanceManager {
  private instances = new Map<string, {
    lastUsed: number;
    sessionId: string;
    messageCount: number;
  }>();

  async sendMessage(storyId: string, prompt: string): Promise<AsyncIterator> {
    const instance = this.instances.get(storyId);

    // Strategy: Reuse session ID, accept process restart
    const args = instance
      ? ['--resume', instance.sessionId, '-p', prompt]
      : ['-p', prompt];

    const proc = spawn('claude', args);

    // Update instance tracking
    const sessionId = await this.extractSessionId(proc);
    this.instances.set(storyId, {
      lastUsed: Date.now(),
      sessionId,
      messageCount: (instance?.messageCount || 0) + 1
    });

    // Cleanup old instances from memory (not process, just tracking)
    this.cleanupOldInstances();

    return this.streamResponse(proc);
  }

  private cleanupOldInstances() {
    const now = Date.now();
    const TTL = 10 * 60 * 1000; // 10 minutes

    for (const [id, instance] of this.instances) {
      if (now - instance.lastUsed > TTL) {
        this.instances.delete(id);
      }
    }
  }
}
```

## The Brutal Truth

**Claude CLI cannot truly stay "hot" because:**

1. **No Interactive Mode** - It's designed to exit after each response
2. **No Server Mode** - Can't listen for incoming requests
3. **No Pipe Support** - Can't read from named pipes continuously
4. **Stdin Closes** - Once it processes input, it's done

## Best Practical Approach Today

```typescript
class OptimizedClaudeAdapter {
  private sessions = new Map<string, string>(); // Track session IDs
  private spawnTimes: number[] = []; // Track spawn performance

  async sendMessage(storyId: string, prompt: string) {
    const startTime = Date.now();

    // 1. Reuse session ID (preserves context)
    const sessionId = this.sessions.get(storyId);

    // 2. Minimize spawn overhead
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions', // Skip prompts
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // 3. Optimize environment
    const env = { ...process.env };
    delete env.CLAUDECODE; // Remove unnecessary vars

    // 4. Spawn with minimal overhead
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      detached: false, // Don't create new process group
      shell: false     // Direct execution
    });

    // 5. Close stdin immediately to start streaming
    proc.stdin?.end();

    // Track performance
    this.spawnTimes.push(Date.now() - startTime);
    if (this.spawnTimes.length > 10) {
      const avg = this.spawnTimes.reduce((a,b) => a+b) / this.spawnTimes.length;
      console.log(`Average spawn time: ${avg}ms`);
    }

    return proc;
  }
}
```

## Recommendation

Since true "hot" instances aren't possible with current Claude CLI:

1. **Use `--resume` for context preservation** (this works today)
2. **Minimize spawn overhead** with optimized flags and environment
3. **Consider hybrid approach** - use Anthropic API for chat, CLI for tools
4. **Request feature from Anthropic** - we need `claude serve` or `claude --interactive`

The session resume pattern is your best bet - it's not truly "hot" but preserves conversation state, which is what matters most for user experience.
