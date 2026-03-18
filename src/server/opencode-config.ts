import fs from "fs";
import path from "path";

export interface StorybookOpenCodeConfig {
  provider?: string;
  model?: string;
}

/**
 * Read provider/model config from .storybook/opencode.json.
 * Returns null if file doesn't exist or can't be parsed.
 */
export function readStorybookConfig(projectRoot: string): StorybookOpenCodeConfig | null {
  const configPath = path.join(projectRoot, ".storybook", "opencode.json");
  try {
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const config: StorybookOpenCodeConfig = {};
    if (typeof raw.provider === "string") config.provider = raw.provider;
    if (typeof raw.model === "string") config.model = raw.model;
    return Object.keys(config).length > 0 ? config : null;
  } catch (err) {
    console.warn("[loracle] Failed to read .storybook/opencode.json:", err);
    return null;
  }
}
