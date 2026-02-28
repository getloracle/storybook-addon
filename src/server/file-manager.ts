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
