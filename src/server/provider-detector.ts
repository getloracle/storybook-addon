import type { OpencodeClient } from "@opencode-ai/sdk";
import { readStorybookConfig } from "./opencode-config.js";

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

/** Default models per provider — used when the API doesn't specify one */
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  "amazon-bedrock": "us.anthropic.claude-sonnet-4-6",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.5-pro",
};

export async function detectProvider(
  client: OpencodeClient,
  projectRoot: string
): Promise<ProviderStatus> {
  // 1. Check .storybook/opencode.json for explicit config (highest priority)
  const storybookConfig = readStorybookConfig(projectRoot);
  if (storybookConfig?.provider) {
    const model =
      storybookConfig.model ??
      PROVIDER_DEFAULT_MODELS[storybookConfig.provider] ??
      null;
    console.log("[loracle] Provider from .storybook/opencode.json:", storybookConfig.provider, "model:", model);
    return { configured: true, provider: storybookConfig.provider, model };
  }

  // 2. Query OpenCode for connected providers
  try {
    const result = await client.provider.list({
      query: { directory: projectRoot },
    });
    const data = result.data as {
      all?: Array<{ id: string; name: string }>;
      default?: Record<string, string>;
      connected?: string[];
    } | undefined;

    if (data?.connected && data.connected.length > 0) {
      const providerId = data.connected[0];
      const model =
        data.default?.[providerId] ??
        PROVIDER_DEFAULT_MODELS[providerId] ??
        null;
      console.log("[loracle] Provider from OpenCode:", providerId, "model:", model);
      return { configured: true, provider: providerId, model };
    }
  } catch (err) {
    console.warn("[loracle] provider.list failed:", err);
  }

  // 3. No provider configured
  console.log(
    "[loracle] No provider configured. Either:\n" +
    "  - Create .storybook/opencode.json with { \"provider\": \"anthropic\" }\n" +
    "  - Or configure OpenCode directly: opencode auth set anthropic"
  );
  return { configured: false, provider: null, model: null };
}

export async function configureProvider(
  client: OpencodeClient,
  providerId: string,
  apiKey: string,
  projectRoot: string
): Promise<void> {
  await client.auth.set({
    path: { id: providerId },
    body: { type: "api", key: apiKey },
    query: { directory: projectRoot },
  });
}
