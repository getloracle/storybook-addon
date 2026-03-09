import type { OpencodeClient } from "@opencode-ai/sdk";

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

const PROVIDER_ENV_MAP: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
};

export async function detectProvider(
  client: OpencodeClient,
  projectRoot: string
): Promise<ProviderStatus> {
  // 1. Check if OpenCode already has a provider configured
  try {
    const providers = await client.config.providers({
      query: { directory: projectRoot },
    });
    const data = providers.data as Array<{
      id: string;
      models?: Array<{ id: string }>;
    }> | undefined;
    if (data && data.length > 0) {
      const provider = data[0];
      const model = provider.models?.[0]?.id ?? null;
      console.log("[loracle] Provider already configured:", provider.id);
      return { configured: true, provider: provider.id, model };
    }
  } catch {
    // No providers configured yet
  }

  // 2. Check env vars and configure
  for (const [envVar, providerId] of Object.entries(PROVIDER_ENV_MAP)) {
    const key = process.env[envVar];
    if (key) {
      try {
        await client.auth.set({
          path: { id: providerId },
          body: { type: "api", key },
          query: { directory: projectRoot },
        });
        console.log(`[loracle] Auto-configured provider from ${envVar}:`, providerId);
        return { configured: true, provider: providerId, model: null };
      } catch (err) {
        console.warn(`[loracle] Failed to configure ${providerId} from ${envVar}:`, err);
      }
    }
  }

  // 3. Check AWS credentials for Bedrock
  // Bedrock auto-detects from AWS env vars (AWS_PROFILE, AWS_ACCESS_KEY_ID, etc.)
  // No auth.set() needed - OpenCode picks up AWS credentials automatically
  if (
    process.env.AWS_PROFILE ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_SESSION_TOKEN
  ) {
    console.log("[loracle] AWS credentials detected, Bedrock provider available");
    return { configured: true, provider: "amazon-bedrock", model: null };
  }

  // 4. Check Google credentials for Vertex
  // Vertex auto-detects from GOOGLE_APPLICATION_CREDENTIALS env var
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("[loracle] Google credentials detected, Vertex provider available");
    return { configured: true, provider: "google", model: null };
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
