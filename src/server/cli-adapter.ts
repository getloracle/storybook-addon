import { spawn, type ChildProcess } from "child_process";
import { Readable } from "stream";
import { createInterface } from "readline";
import type { StreamEvent } from "../types.js";

export interface CLIAdapter {
  spawn(prompt: string, sessionId?: string | null): ChildProcess;
  stream(proc: ChildProcess): AsyncIterable<StreamEvent>;
  kill(proc: ChildProcess): void;
}

export class ClaudeCodeAdapter implements CLIAdapter {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  spawn(prompt: string, sessionId?: string | null): ChildProcess {
    const allowedTools = [
      "Read", "Edit", "Write", "Glob", "Grep",
      "Bash",
      "mcp__loracle__get_components",
    ].join(",");
    const disallowedTools = ["Agent", "WebFetch"].join(",");
    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--allowedTools", allowedTools,
      "--disallowedTools", disallowedTools,
    ];
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    // Remove CLAUDECODE env var to allow spawning inside a Claude Code session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    console.log("[loracle] Spawning claude CLI:", { args: args.slice(0, 4), cwd: this.projectRoot, hasSession: !!sessionId });

    const proc = spawn("claude", args, {
      cwd: this.projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    proc.on("error", (err) => {
      console.error("[loracle] CLI spawn error:", err.message);
    });

    proc.on("close", (code) => {
      console.log("[loracle] CLI process exited with code:", code);
    });

    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        console.error("[loracle] CLI stderr:", chunk.toString());
      });
    }

    // Close stdin immediately — Claude CLI waits for stdin to close before streaming output
    if (proc.stdin) {
      proc.stdin.end();
    }

    return proc;
  }

  async *stream(proc: ChildProcess): AsyncIterable<StreamEvent & { sessionId?: string }> {
    if (!proc.stdout) return;

    const rl = createInterface({ input: proc.stdout as Readable });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const event = this.mapEvent(raw);

        // Attach session_id from init or result events
        const sessionId = raw.session_id as string | undefined;
        if (sessionId) {
          (event as StreamEvent & { sessionId?: string }).sessionId = sessionId;
        }

        yield event as StreamEvent & { sessionId?: string };
      } catch {
        yield { type: "text", content: line };
      }
    }

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
      if (proc.exitCode !== null) {
        resolve(proc.exitCode);
      } else {
        proc.on("close", (code) => resolve(code ?? 0));
      }
    });

    yield { type: "done", content: exitCode === 0 ? "completed" : `exited with code ${exitCode}` };
  }

  kill(proc: ChildProcess): void {
    if (proc.killed) return;

    proc.kill("SIGTERM");

    // Fallback to SIGKILL after 5s
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    }, 5000);
  }

  private mapEvent(event: Record<string, unknown>): StreamEvent {
    const type = event.type as string;

    // system init event — extract session_id
    if (type === "system" && event.subtype === "init") {
      return {
        type: "text",
        content: "",
        // Store session_id for later use
      };
    }

    // assistant message — extract text and tool_use blocks
    if (type === "assistant" && event.message) {
      const msg = event.message as Record<string, unknown>;
      const content = msg.content as Array<Record<string, unknown>>;
      if (content && content.length > 0) {
        const texts: string[] = [];
        for (const block of content) {
          if (block.type === "text") {
            texts.push(block.text as string);
          }
          if (block.type === "tool_use") {
            return {
              type: "tool_use",
              toolName: block.name as string,
              toolInput: block.input as Record<string, unknown>,
            };
          }
        }
        if (texts.length > 0) {
          return { type: "text", content: texts.join("") };
        }
      }
    }

    // content_block_delta — streaming text chunks
    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown>;
      if (delta?.type === "text_delta") {
        return { type: "text", content: delta.text as string };
      }
    }

    // result — final result with session_id
    if (type === "result") {
      const isError = event.is_error as boolean;
      if (isError) {
        const result = event.result as string | undefined;
        return { type: "error", content: result || "Unknown error" };
      }
      // Don't re-emit result text — it duplicates the assistant message content
      return { type: "text", content: "" };
    }

    // Fallback
    return { type: "text", content: "" };
  }
}
