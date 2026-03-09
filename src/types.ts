export type GenerationPhase =
  | "idle"
  | "submitted"
  | "thinking"
  | "design-system"
  | "writing"
  | "done"
  | "error";

export interface ImageAttachment {
  path: string;
  base64: string;
  mimeType: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  codeSnapshot?: string;
  image?: ImageAttachment;
}

export interface ChatSession {
  storyId: string;
  cliSessionId?: string | null;
  messages: ChatMessage[];
  filePath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StreamEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}
