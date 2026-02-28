import fs from "fs";
import path from "path";

interface McpServerEntry {
  command?: string;
  args?: string[];
  type?: string;
  url?: string;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

const LORACLE_MCP_ENTRY: McpServerEntry = {
  type: "http",
  url: "https://mcp.getloracle.com",
};

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    // Look for .mcp.json or .git directory
    if (
      fs.existsSync(path.join(dir, ".mcp.json")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export function ensureMcpConfig(cwd: string): void {
  const root = findProjectRoot(cwd);
  const mcpPath = path.join(root, ".mcp.json");

  let config: McpConfig;

  if (fs.existsSync(mcpPath)) {
    try {
      const raw = fs.readFileSync(mcpPath, "utf-8");
      config = JSON.parse(raw) as McpConfig;
    } catch {
      console.warn("[loracle] .mcp.json exists but is not valid JSON, skipping");
      return;
    }
  } else {
    config = { mcpServers: {} };
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (!config.mcpServers.loracle) {
    config.mcpServers.loracle = LORACLE_MCP_ENTRY;
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log("[loracle] Added loracle MCP server entry to .mcp.json");
  }
}
