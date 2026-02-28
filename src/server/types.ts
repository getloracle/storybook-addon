import type { ChatSession, ChatMessage } from "../types.js";

export interface PromptRequest {
  prompt: string;
  storyId: string;
  images?: string[];
}

export interface PromptResponse {
  generationId: string;
}

export interface SessionResponse {
  session: ChatSession | null;
}

export interface HealthResponse {
  status: "ok";
}

export type { ChatSession, ChatMessage };
