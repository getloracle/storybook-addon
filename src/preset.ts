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
  const { startOpenCode, stopOpenCode } = await import(
    "./server/opencode-lifecycle.js"
  );

  const projectRoot = process.cwd();

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
