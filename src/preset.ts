import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function managerEntries(entry: string[] = []) {
  return [...entry, join(__dirname, "manager.js")];
}

export function previewAnnotations(entry: string[] = []) {
  return [...entry, join(__dirname, "preview.js")];
}

export async function viteFinal(config: any) {
  const { createMiddleware } = await import("./server/middleware.js");
  const { ensureMcpConfig } = await import("./server/mcp-config.js");
  const { AGENTS_MD_TEMPLATE } = await import("./server/agents-template.js");
  const { startOpenCode, stopOpenCode } = await import(
    "./server/opencode-lifecycle.js"
  );

  const projectRoot = process.cwd();

  // Phase 6: Auto-configure MCP and AGENTS.md
  try {
    ensureMcpConfig(projectRoot);
  } catch (err) {
    console.warn("[loracle] Failed to configure .mcp.json:", err);
  }

  try {
    const agentsPath = join(projectRoot, ".storybook", "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      const dir = dirname(agentsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(agentsPath, AGENTS_MD_TEMPLATE, "utf-8");
      console.log("[loracle] Created .storybook/AGENTS.md");
    }
  } catch (err) {
    console.warn("[loracle] Failed to create AGENTS.md:", err);
  }

  // Wire middleware
  const { middleware: loracleMiddleware, setClient } =
    createMiddleware(projectRoot);

  config.plugins = config.plugins || [];
  config.plugins.push({
    name: "loracle-design-agent",
    configureServer(server: any) {
      server.middlewares.use(loracleMiddleware);

      // Start OpenCode server in background
      startOpenCode({ projectRoot })
        .then(({ client }) => {
          setClient(client);
          console.log("[loracle] OpenCode connected to middleware");
        })
        .catch((err) => {
          console.error("[loracle] Failed to start OpenCode:", err);
        });

      // Graceful shutdown when Storybook server closes
      server.httpServer?.on("close", () => {
        stopOpenCode();
      });
    },
  });

  return config;
}
