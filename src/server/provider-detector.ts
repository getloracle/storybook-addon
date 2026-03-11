import fs from "fs";
import path from "path";
import type { OpencodeClient } from "@opencode-ai/sdk";

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

export interface StorybookOpenCodeConfig {
  provider?: string;
  model?: string;
}

/** Default models per provider — used when the API doesn't specify one */
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  "amazon-bedrock": "us.anthropic.claude-sonnet-4-6",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.5-pro",
};

/**
 * Map of env vars that prove a provider has valid credentials.
 * Order matters: first match wins when selecting from connected providers.
 */
const CREDENTIAL_ENV_MAP: Array<{ envVars: string[]; providerId: string }> = [
  { envVars: ["ANTHROPIC_API_KEY"], providerId: "anthropic" },
  { envVars: ["OPENAI_API_KEY"], providerId: "openai" },
  { envVars: ["AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SESSION_TOKEN"], providerId: "amazon-bedrock" },
  { envVars: ["GOOGLE_APPLICATION_CREDENTIALS"], providerId: "google" },
];

/** Check which providers have env-based credentials available */
function getCredentialedProviders(): Set<string> {
  const result = new Set<string>();
  for (const { envVars, providerId } of CREDENTIAL_ENV_MAP) {
    if (envVars.some((v) => process.env[v])) {
      result.add(providerId);
    }
  }
  return result;
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

export async function detectProvider(
  client: OpencodeClient,
  projectRoot: string
): Promise<ProviderStatus> {
  // 0. Check .storybook/opencode.json for explicit config (highest priority)
  const storybookConfig = readStorybookConfig(projectRoot);
  if (storybookConfig?.provider) {
    const model =
      storybookConfig.model ??
      PROVIDER_DEFAULT_MODELS[storybookConfig.provider] ??
      null;
    console.log("[loracle] Provider from .storybook/opencode.json:", storybookConfig.provider, "model:", model);
    return { configured: true, provider: storybookConfig.provider, model };
  }

  const credentialedProviders = getCredentialedProviders();
  console.log("[loracle] Providers with env credentials:", [...credentialedProviders]);

  // 1. Use provider.list() — returns connected providers and default model map
  try {
    const result = await client.provider.list({
      query: { directory: projectRoot },
    });
    const data = result.data as {
      all?: Array<{ id: string; name: string }>;
      default?: Record<string, string>;
      connected?: string[];
    } | undefined;

    console.log("[loracle] provider.list connected:", data?.connected);

    if (data?.connected && data.connected.length > 0) {
      const connected = new Set(data.connected);

      // Prefer a connected provider that also has env credentials
      let providerId: string | null = null;
      for (const cred of credentialedProviders) {
        if (connected.has(cred)) {
          providerId = cred;
          break;
        }
      }
      // Fall back to first connected provider
      if (!providerId) {
        providerId = data.connected[0];
      }

      const model =
        data.default?.[providerId] ??
        PROVIDER_DEFAULT_MODELS[providerId] ??
        null;
      console.log("[loracle] Provider selected:", providerId, "model:", model);
      return { configured: true, provider: providerId, model };
    }
  } catch (err) {
    console.warn("[loracle] provider.list failed:", err);
  }

  // 2. Fallback: use env-var detection directly
  for (const { envVars, providerId } of CREDENTIAL_ENV_MAP) {
    if (envVars.some((v) => process.env[v])) {
      // For API-key providers (not IAM/profile-based), auto-configure via auth.set.
      // Skip amazon-bedrock and google which use IAM credentials, not API keys.
      if (providerId !== "amazon-bedrock" && providerId !== "google") {
        const apiKeyVar = envVars.find((v) => v.endsWith("_API_KEY"));
        if (apiKeyVar && process.env[apiKeyVar]) {
          try {
            await client.auth.set({
              path: { id: providerId },
              body: { type: "api", key: process.env[apiKeyVar]! },
              query: { directory: projectRoot },
            });
            console.log(`[loracle] Auto-configured provider from ${apiKeyVar}:`, providerId);
          } catch (err) {
            console.warn(`[loracle] Failed to configure ${providerId}:`, err);
          }
        }
      }
      console.log("[loracle] Provider from env:", providerId);
      return { configured: true, provider: providerId, model: PROVIDER_DEFAULT_MODELS[providerId] ?? null };
    }
  }

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
