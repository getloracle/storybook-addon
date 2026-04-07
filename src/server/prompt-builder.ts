import fs from "fs";
import path from "path";
import type { ChatMessage, ImageAttachment } from "../types.js";

export class PromptBuilder {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  build(opts: {
    userPrompt: string;
    storyFilePath?: string;
    chatHistory?: ChatMessage[];
    image?: ImageAttachment;
  }): string {
    const parts: string[] = [];

    // AGENTS.md system instructions
    const agentsPath = path.join(this.projectRoot, ".storybook", "AGENTS.md");
    if (fs.existsSync(agentsPath)) {
      const agentsContent = fs.readFileSync(agentsPath, "utf-8");
      parts.push(`<system_instructions>\n${agentsContent}\n</system_instructions>`);
    }

    // Scope constraint — tells the agent which file to modify.
    // We do NOT inline file content: OpenCode's edit tool requires a read
    // call first, and providing content inline causes agents to skip read.
    if (opts.storyFilePath) {
      const fullPath = path.resolve(this.projectRoot, opts.storyFilePath);
      if (fs.existsSync(fullPath)) {
        parts.push(
          `<scope_constraint>
IMPORTANT: You must modify the story file at "${opts.storyFilePath}".
ALL changes MUST go into this single file. Do NOT create new files or new story files.
Do NOT add new named exports or new stories. Modify the EXISTING story exports in the file.
If the file has a "Default" or other named story export, implement your changes by editing that existing export's render/args/template — do not create a separate story export with a different name.
The user is viewing a specific story in Storybook right now. Your job is to update THAT story, not create a new one alongside it.
CRITICAL: Do NOT change the "title" field in the meta/default export. The title controls the story's ID and URL in Storybook — changing it will break navigation and cause a "Couldn't find story" error. Keep the existing title exactly as-is.
</scope_constraint>`
        );
      }
    }

    // Chat history (truncate to last N messages to stay within prompt limits)
    if (opts.chatHistory && opts.chatHistory.length > 0) {
      const MAX_HISTORY_MESSAGES = 10;
      const recentMessages = opts.chatHistory.slice(-MAX_HISTORY_MESSAGES);
      const historyXml = recentMessages
        .map(
          (msg) =>
            `<message role="${msg.role}" timestamp="${msg.timestamp}">\n${msg.content}\n</message>`
        )
        .join("\n");
      parts.push(`<chat_history>\n${historyXml}\n</chat_history>`);
    }

    // Image context note — the actual image is sent inline as a FilePartInput
    if (opts.image) {
      parts.push(
        `<attached_image>\nAn image has been attached inline with this message. Use it as the visual reference for your response.\n</attached_image>`
      );
    }

    // User prompt
    parts.push(opts.userPrompt);

    return parts.join("\n\n");
  }
}
