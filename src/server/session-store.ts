import fs from "fs";
import path from "path";
import type { ChatSession, ChatMessage } from "../types.js";

export class SessionStore {
  private sessionsDir: string;

  constructor(projectRoot: string) {
    this.sessionsDir = path.join(projectRoot, ".storybook", "ai-sessions");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getSessionPath(storyId: string): string {
    const sanitized = storyId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.sessionsDir, `${sanitized}.chat.json`);
  }

  load(storyId: string): ChatSession | null {
    const filePath = this.getSessionPath(storyId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as ChatSession;
    } catch {
      return null;
    }
  }

  save(session: ChatSession): void {
    this.ensureDir();
    const filePath = this.getSessionPath(session.storyId);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  addMessage(storyId: string, message: ChatMessage): ChatSession {
    const now = Date.now();
    let session = this.load(storyId);
    if (!session) {
      session = {
        storyId,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
    }
    session.messages.push(message);
    session.updatedAt = now;
    this.save(session);
    return session;
  }

  updateCliSessionId(storyId: string, cliSessionId: string | null): void {
    const session = this.load(storyId);
    if (session) {
      session.cliSessionId = cliSessionId;
      session.updatedAt = Date.now();
      this.save(session);
    }
  }

  updateFilePath(storyId: string, filePath: string): void {
    const session = this.load(storyId);
    if (session) {
      session.filePath = filePath;
      session.updatedAt = Date.now();
      this.save(session);
    }
  }
}
