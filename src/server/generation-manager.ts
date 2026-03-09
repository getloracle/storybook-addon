import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import { PromptBuilder } from "./prompt-builder.js";
import { SessionStore } from "./session-store.js";
import { FileManager } from "./file-manager.js";
import type { StreamEvent, ChatMessage, ImageAttachment } from "../types.js";
import type { OpencodeClient } from "@opencode-ai/sdk";

interface Generation {
  id: string;
  storyId: string;
  events: StreamEvent[];
  done: boolean;
  listeners: Set<(event: StreamEvent) => void>;
  fullText: string;
  /** Absolute path to the live story file */
  liveAbsPath: string | null;
  /** Absolute path to the staging file (in .temp/) */
  stagingAbsPath: string | null;
  /** Abort controller for killing this generation */
  abortStoryId: string;
}

export class GenerationManager {
  private projectRoot: string;
  private adapter: OpenCodeAdapter | null = null;
  private promptBuilder: PromptBuilder;
  private sessionStore: SessionStore;
  private fileManager: FileManager;
  private generations: Map<string, Generation> = new Map();
  private activeGeneration: Generation | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.promptBuilder = new PromptBuilder(projectRoot);
    this.sessionStore = new SessionStore(projectRoot);
    this.fileManager = new FileManager(projectRoot);
  }

  setClient(client: OpencodeClient): void {
    this.adapter = new OpenCodeAdapter(this.projectRoot, client);
  }

  async warmSession(storyId: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.createOrGetSession(storyId);
  }

  startGeneration(opts: {
    prompt: string;
    storyId: string;
    storyFilePath?: string;
    image?: ImageAttachment;
  }): string {
    if (!this.adapter) {
      throw new Error("OpenCode client not initialized");
    }

    // Kill any active generation
    if (this.activeGeneration && !this.activeGeneration.done) {
      this.killGeneration(this.activeGeneration.id);
    }

    const id = randomUUID();
    const session = this.sessionStore.load(opts.storyId);

    // Resolve absolute path for the live story file
    let liveAbsPath: string | null = null;
    if (opts.storyFilePath) {
      liveAbsPath = path.isAbsolute(opts.storyFilePath)
        ? opts.storyFilePath
        : path.join(this.projectRoot, opts.storyFilePath);
    }

    // Capture current file content as snapshot before changes
    let codeSnapshot: string | undefined;
    if (liveAbsPath) {
      try {
        if (fs.existsSync(liveAbsPath)) {
          codeSnapshot = fs.readFileSync(liveAbsPath, "utf-8");
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
      image: opts.image,
      codeSnapshot,
    };
    this.sessionStore.addMessage(opts.storyId, userMessage);

    // Track filePath on session
    if (opts.storyFilePath) {
      this.sessionStore.updateFilePath(opts.storyId, opts.storyFilePath);
    }

    // Build full prompt (OpenCode handles its own session context, but we still
    // provide system instructions and story file context)
    const isResuming = !!session?.cliSessionId;
    const fullPrompt = this.promptBuilder.build({
      userPrompt: opts.prompt,
      storyFilePath: opts.storyFilePath,
      chatHistory: isResuming ? undefined : session?.messages,
      image: opts.image,
    });

    const generation: Generation = {
      id,
      storyId: opts.storyId,
      events: [],
      done: false,
      listeners: new Set(),
      fullText: "",
      liveAbsPath,
      stagingAbsPath: null,
      abortStoryId: opts.storyId,
    };

    this.generations.set(id, generation);
    this.activeGeneration = generation;

    console.log("[loracle] Generation started:", {
      id,
      storyId: opts.storyId,
      promptLength: fullPrompt.length,
    });

    // Start streaming in background
    this.consumeStream(generation, fullPrompt);

    return id;
  }

  private async consumeStream(
    generation: Generation,
    prompt: string
  ): Promise<void> {
    let streamError = false;
    let openCodeSessionId: string | undefined;

    console.log("[loracle] Consuming stream for generation:", generation.id);
    try {
      const { sessionId, stream } = await this.adapter!.sendMessage(
        generation.storyId,
        prompt
      );
      openCodeSessionId = sessionId;

      for await (const event of stream) {
        console.log(
          "[loracle] Stream event:",
          event.type,
          event.content?.slice(0, 80)
        );
        generation.events.push(event);

        if (event.type === "text" && event.content) {
          generation.fullText += event.content;
        }

        if (event.type === "error") {
          streamError = true;
        }

        // Notify all listeners
        for (const listener of generation.listeners) {
          listener(event);
        }
      }
    } catch (err) {
      streamError = true;
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

      // Save OpenCode session ID for resume support
      if (openCodeSessionId) {
        this.sessionStore.updateCliSessionId(
          generation.storyId,
          openCodeSessionId
        );
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

    if (this.adapter) {
      this.adapter.kill(generation.abortStoryId);
    }
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
