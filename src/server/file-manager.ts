import fs from "fs";
import path from "path";

export class FileManager {
  private projectRoot: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  get draftsDir(): string {
    return path.join(this.projectRoot, "__ai_drafts__");
  }

  get tempDir(): string {
    return path.join(this.draftsDir, ".temp");
  }

  get uploadsDir(): string {
    return path.join(this.draftsDir, ".uploads");
  }

  ensureStagingDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  atomicWrite(targetPath: string, content: string): void {
    this.ensureStagingDir();
    const tempPath = path.join(
      this.tempDir,
      `write-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, targetPath);
  }

  watchFile(filePath: string, onChange: () => void): void {
    if (this.watchers.has(filePath)) return;
    if (!fs.existsSync(filePath)) return;

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === "change") {
        onChange();
      }
    });
    this.watchers.set(filePath, watcher);
  }

  createDraftScaffold(componentName: string): string {
    const fileName = `${componentName}.stories.tsx`;
    const filePath = path.join(this.draftsDir, fileName);

    if (fs.existsSync(filePath)) {
      throw new Error(`CONFLICT: ${fileName} already exists in __ai_drafts__/`);
    }

    const scaffold = `import type { Meta, StoryObj } from "@storybook/react";

const ${componentName} = () => <div>${componentName}</div>;

const meta: Meta<typeof ${componentName}> = {
  title: "AI Drafts/${componentName}",
  component: ${componentName},
};

export default meta;
type Story = StoryObj<typeof ${componentName}>;

export const Default: Story = {};
`;

    this.atomicWrite(filePath, scaffold);
    return `__ai_drafts__/${fileName}`;
  }


  unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
