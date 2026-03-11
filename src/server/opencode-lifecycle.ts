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
 * .storybook/opencode.json (addon-specific provider/model overrides),
 * then merge them into a single config object for the server.
 *
 * OPENCODE_CONFIG_CONTENT env var overrides file-based config, so we must
 * explicitly read and forward the file config to createOpencodeServer.
 */
function buildServerConfig(
  projectRoot: string,
  mcpConfig: Record<string, { type: "local"; command: string[] }> | null
): Record<string, unknown> {
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

  // 2. Read .storybook/opencode.json for addon-specific provider/model
  const storybookConfigPath = path.join(projectRoot, ".storybook", "opencode.json");
  if (fs.existsSync(storybookConfigPath)) {
    try {
      const addonConfig = JSON.parse(fs.readFileSync(storybookConfigPath, "utf-8"));
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
    } catch (err) {
      console.warn("[loracle] Failed to parse .storybook/opencode.json:", err);
    }
  }

  // 3. Merge MCP config
  if (mcpConfig) {
    fileConfig.mcp = { ...(fileConfig.mcp as Record<string, unknown> ?? {}), ...mcpConfig };
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

    // Build MCP config to pass at server startup.
    // OpenCode's type:"remote" silently fails to register tools (anomalyco/opencode#9425).
    // Workaround: use mcp-remote to bridge the remote loracle server to stdio,
    // then register it as type:"local" which works correctly.
    const mcpConfig = buildLoracleMcpConfig(opts.projectRoot);

    // Merge project opencode.json + .storybook/opencode.json + MCP into one config.
    // This is critical because OPENCODE_CONFIG_CONTENT env var (used by the SDK)
    // overrides file-based config — so we must forward everything explicitly.
    const serverConfig = buildServerConfig(opts.projectRoot, mcpConfig);

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

/**
 * Read the loracle entry from .mcp.json and build an OpenCode MCP config
 * that uses mcp-remote as a stdio bridge (works around anomalyco/opencode#9425).
 */
function buildLoracleMcpConfig(
  projectRoot: string
): Record<string, { type: "local"; command: string[] }> | null {
  // Walk up from projectRoot to find .mcp.json
  let dir = projectRoot;
  while (dir !== path.dirname(dir)) {
    const mcpPath = path.join(dir, ".mcp.json");
    if (fs.existsSync(mcpPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
        const mcpServers = raw.mcpServers || {};
        const loracleEntry = mcpServers.loracle;
        if (!loracleEntry) {
          console.log("[loracle] No loracle entry in .mcp.json");
          return null;
        }

        const url = loracleEntry.url as string;
        const headers = loracleEntry.headers as Record<string, string> | undefined;

        // Build mcp-remote command: npx -y mcp-remote <url> [--header key:value ...]
        const command = ["npx", "-y", "mcp-remote", url];
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            command.push("--header", `${key}:${value}`);
          }
        }

        console.log("[loracle] Configured loracle MCP via mcp-remote (stdio bridge)");
        return { loracle: { type: "local", command } };
      } catch {
        console.warn("[loracle] Failed to parse .mcp.json");
        return null;
      }
    }
    dir = path.dirname(dir);
  }

  console.log("[loracle] No .mcp.json found");
  return null;
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
