import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChildProcess } from "child_process";
import { ClaudeCodeAdapter } from "./cli-adapter.js";
import { PromptBuilder } from "./prompt-builder.js";
import { SessionStore } from "./session-store.js";
import type { StreamEvent, ChatMessage } from "../types.js";

interface Generation {
  id: string;
  storyId: string;
  process: ChildProcess;
  events: StreamEvent[];
  done: boolean;
  listeners: Set<(event: StreamEvent) => void>;
  fullText: string;
}

export class GenerationManager {
  private projectRoot: string;
  private adapter: ClaudeCodeAdapter;
  private promptBuilder: PromptBuilder;
  private sessionStore: SessionStore;
  private generations: Map<string, Generation> = new Map();
  private activeGeneration: Generation | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.adapter = new ClaudeCodeAdapter(projectRoot);
    this.promptBuilder = new PromptBuilder(projectRoot);
    this.sessionStore = new SessionStore(projectRoot);
  }

  startGeneration(opts: {
    prompt: string;
    storyId: string;
    storyFilePath?: string;
    images?: string[];
  }): string {
    // Kill any active generation
    if (this.activeGeneration && !this.activeGeneration.done) {
      this.killGeneration(this.activeGeneration.id);
    }

    const id = randomUUID();
    const session = this.sessionStore.load(opts.storyId);

    // Capture current file content as snapshot before changes
    let codeSnapshot: string | undefined;
    if (opts.storyFilePath) {
      const absPath = path.isAbsolute(opts.storyFilePath)
        ? opts.storyFilePath
        : path.join(this.projectRoot, opts.storyFilePath);
      try {
        if (fs.existsSync(absPath)) {
          codeSnapshot = fs.readFileSync(absPath, "utf-8");
        }
      } catch {
        // Ignore read errors
      }
    }

    // Save user message with snapshot of code at time of prompt
    const userMessage: ChatMessage = {
      role: "user",
      content: opts.prompt,
      timestamp: Date.now(),
      images: opts.images,
      codeSnapshot,
    };
    this.sessionStore.addMessage(opts.storyId, userMessage);

    // Track filePath on session
    if (opts.storyFilePath) {
      this.sessionStore.updateFilePath(opts.storyId, opts.storyFilePath);
    }

    // Build full prompt
    const fullPrompt = this.promptBuilder.build({
      userPrompt: opts.prompt,
      storyFilePath: opts.storyFilePath,
      chatHistory: session?.messages,
      images: opts.images,
    });

    // Spawn CLI process
    const proc = this.adapter.spawn(fullPrompt, session?.cliSessionId);

    const generation: Generation = {
      id,
      storyId: opts.storyId,
      process: proc,
      events: [],
      done: false,
      listeners: new Set(),
      fullText: "",
    };

    this.generations.set(id, generation);
    this.activeGeneration = generation;

    console.log("[loracle] Generation started:", { id, storyId: opts.storyId, promptLength: fullPrompt.length });

    // Start streaming in background
    this.consumeStream(generation);

    return id;
  }

  private async consumeStream(generation: Generation): Promise<void> {
    let cliSessionId: string | undefined;

    console.log("[loracle] Consuming stream for generation:", generation.id);
    try {
      for await (const event of this.adapter.stream(generation.process)) {
        console.log("[loracle] Stream event:", event.type, event.content?.slice(0, 80));
        generation.events.push(event);

        if (event.type === "text" && event.content) {
          generation.fullText += event.content;
        }

        // Capture CLI session ID
        if ("sessionId" in event && event.sessionId) {
          cliSessionId = event.sessionId as string;
        }

        // Notify all listeners
        for (const listener of generation.listeners) {
          listener(event);
        }
      }
    } catch (err) {
      const errorEvent: StreamEvent = {
        type: "error",
        content: err instanceof Error ? err.message : "Stream error",
      };
      generation.events.push(errorEvent);
      for (const listener of generation.listeners) {
        listener(errorEvent);
      }
    } finally {
      generation.done = true;

      // Save assistant response to session
      if (generation.fullText) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: generation.fullText,
          timestamp: Date.now(),
        };
        this.sessionStore.addMessage(generation.storyId, assistantMessage);
      }

      // Save CLI session ID for resume support
      if (cliSessionId) {
        this.sessionStore.updateCliSessionId(generation.storyId, cliSessionId);
      }

      if (this.activeGeneration === generation) {
        this.activeGeneration = null;
      }
    }
  }

  subscribe(
    generationId: string,
    listener: (event: StreamEvent) => void
  ): () => void {
    const generation = this.generations.get(generationId);
    if (!generation) return () => {};

    // Replay existing events
    for (const event of generation.events) {
      listener(event);
    }

    if (generation.done) return () => {};

    // Subscribe to new events
    generation.listeners.add(listener);
    return () => {
      generation.listeners.delete(listener);
    };
  }

  killGeneration(generationId?: string): boolean {
    const generation = generationId
      ? this.generations.get(generationId)
      : this.activeGeneration;

    if (!generation || generation.done) return false;

    this.adapter.kill(generation.process);
    generation.done = true;

    const killEvent: StreamEvent = {
      type: "done",
      content: "killed",
    };
    for (const listener of generation.listeners) {
      listener(killEvent);
    }

    if (this.activeGeneration === generation) {
      this.activeGeneration = null;
    }

    return true;
  }

  isGenerationDone(generationId: string): boolean {
    const generation = this.generations.get(generationId);
    return generation?.done ?? true;
  }
}
