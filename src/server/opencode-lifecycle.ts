import fs from "fs";
import path from "path";
import type { OpencodeClient } from "@opencode-ai/sdk";

let opencodeInstance: {
  client: OpencodeClient;
  server: { url: string; close(): void };
} | null = null;

let startPromise: Promise<typeof opencodeInstance> | null = null;

export interface LifecycleOptions {
  port?: number;
  projectRoot: string;
}

/**
 * Read the project's opencode.json (standard OpenCode config) and
 * .storybook/opencode.json (addon-specific overrides for provider, model, and MCP),
 * then merge them into a single config object for the server.
 *
 * OPENCODE_CONFIG_CONTENT env var overrides file-based config, so we must
 * explicitly read and forward the file config to createOpencodeServer.
 */
function buildServerConfig(projectRoot: string): Record<string, unknown> {
  let fileConfig: Record<string, unknown> = {};

  // 1. Read project-root opencode.json (standard OpenCode config)
  const rootConfigPath = path.join(projectRoot, "opencode.json");
  if (fs.existsSync(rootConfigPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(rootConfigPath, "utf-8"));
      console.log("[loracle] Loaded opencode.json from project root");
    } catch (err) {
      console.warn("[loracle] Failed to parse opencode.json:", err);
    }
  }

  // 2. Read .storybook/opencode.json for addon-specific provider/model/mcp
  let hasUserPermissions = false;
  const storybookConfigPath = path.join(projectRoot, ".storybook", "opencode.json");
  if (fs.existsSync(storybookConfigPath)) {
    try {
      const addonConfig = JSON.parse(fs.readFileSync(storybookConfigPath, "utf-8"));

      // Check if user explicitly configured permissions — if so, skip secure defaults
      hasUserPermissions = !!addonConfig.permission;

      // Translate addon config (provider + model) into OpenCode's model format
      if (addonConfig.provider && addonConfig.model) {
        fileConfig.model = `${addonConfig.provider}/${addonConfig.model}`;
        console.log("[loracle] Model from .storybook/opencode.json:", fileConfig.model);
      } else if (addonConfig.provider) {
        // Provider without explicit model — set enabled_providers so it's available
        if (!fileConfig.enabled_providers) {
          fileConfig.enabled_providers = [addonConfig.provider];
        }
        console.log("[loracle] Provider from .storybook/opencode.json:", addonConfig.provider);
      }

      // Merge MCP config from .storybook/opencode.json
      if (addonConfig.mcp && typeof addonConfig.mcp === "object") {
        fileConfig.mcp = { ...(fileConfig.mcp as Record<string, unknown> ?? {}), ...addonConfig.mcp };
        console.log("[loracle] MCP config from .storybook/opencode.json:", Object.keys(addonConfig.mcp));
      }
    } catch (err) {
      console.warn("[loracle] Failed to parse .storybook/opencode.json:", err);
    }
  }

  // 3. Apply secure defaults when user hasn't configured permissions
  if (!hasUserPermissions) {
    // Allow reads everywhere, writes only to story files.
    // Everything else (read, glob, grep, list, skill, MCP tools) stays at opencode's default ("allow").
    fileConfig.permission = {
      edit: {
        "*": "deny",
        "**/*.stories.*": "allow",
      },
      write: {
        "*": "deny",
        "**/*.stories.*": "allow",
      },
      bash: "deny",
      patch: "deny",
      webfetch: "deny",
      websearch: "deny",
    };

    // Disable dangerous tools entirely (can't even be invoked)
    fileConfig.tools = {
      bash: false,
      webfetch: false,
      websearch: false,
      patch: false,
    };

    console.log("[loracle] Secure defaults applied — writes restricted to *.stories.* files");
  } else {
    console.log("[loracle] User permissions detected in .storybook/opencode.json — using user config");
  }

  return fileConfig;
}

export async function startOpenCode(
  opts: LifecycleOptions
): Promise<{ client: OpencodeClient; url: string }> {
  if (opencodeInstance) {
    return { client: opencodeInstance.client, url: opencodeInstance.server.url };
  }

  // Prevent concurrent starts
  if (startPromise) {
    const instance = await startPromise;
    return { client: instance!.client, url: instance!.server.url };
  }

  startPromise = (async () => {
    const { createOpencodeServer, createOpencodeClient } = await import(
      "@opencode-ai/sdk"
    );

    // Merge project opencode.json + .storybook/opencode.json into one config.
    // This is critical because OPENCODE_CONFIG_CONTENT env var (used by the SDK)
    // overrides file-based config — so we must forward everything explicitly.
    const serverConfig = buildServerConfig(opts.projectRoot);

    console.log("[loracle] Starting OpenCode server...");
    const server = await createOpencodeServer({
      ...(opts.port != null && { port: opts.port }),
      config: serverConfig as Parameters<typeof createOpencodeServer>[0] extends { config?: infer C } ? C : never,
    });

    // Create client with directory header so all requests scope to this project
    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: opts.projectRoot,
    });

    const instance = { client, server };
    opencodeInstance = instance;
    console.log("[loracle] OpenCode server started at:", server.url);

    return instance;
  })();

  try {
    const instance = await startPromise;
    return { client: instance!.client, url: instance!.server.url };
  } catch (err) {
    startPromise = null;
    throw err;
  }
}

export function getOpenCodeClient(): OpencodeClient | null {
  return opencodeInstance?.client ?? null;
}

export function getOpenCodeUrl(): string | null {
  return opencodeInstance?.server.url ?? null;
}

export function stopOpenCode(): void {
  if (opencodeInstance) {
    console.log("[loracle] Stopping OpenCode server...");
    try {
      opencodeInstance.server.close();
    } catch (err) {
      console.error("[loracle] Error stopping OpenCode server:", err);
    }
    opencodeInstance = null;
    startPromise = null;
  }
}
