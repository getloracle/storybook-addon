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

    console.log("[loracle] Starting OpenCode server...");
    const server = await createOpencodeServer({
      ...(opts.port != null && { port: opts.port }),
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
