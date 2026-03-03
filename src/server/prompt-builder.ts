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

    // Current story file content + scope constraint
    if (opts.storyFilePath) {
      const fullPath = path.resolve(this.projectRoot, opts.storyFilePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        parts.push(
          `<current_story_file path="${opts.storyFilePath}">\n${content}\n</current_story_file>`
        );
        parts.push(
          `<scope_constraint>
IMPORTANT: You are editing the story file above ("${opts.storyFilePath}").
ALL changes MUST go into this single file. Do NOT create new files or new story files.
Add new stories as additional named exports within this file.
If the user asks for something that seems unrelated to the current component (e.g. "create login form" while viewing a Button story), implement it as a new story composition within this file using the current component and any additional Penny components needed.
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

    // Image reference — agent uses Read tool to view the image natively
    if (opts.image) {
      parts.push(`<uploaded_image path="${opts.image.path}" />`);
    }

    // User prompt
    parts.push(opts.userPrompt);

    return parts.join("\n\n");
  }
}
