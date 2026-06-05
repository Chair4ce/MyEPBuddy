import type { ModelProvider } from "@/lib/ai-models/types";
import type { ProviderDiscoveredModel } from "@/lib/ai-models/types";

const OPENAI_PREFIXES = ["gpt-", "o1", "o3", "o4", "chatgpt-"];
const OPENAI_EXCLUDES = [
  "dall-e",
  "whisper",
  "tts-",
  "text-embedding",
  "davinci",
  "babbage",
  "curie",
  "ada",
  "realtime",
  "audio",
  "transcribe",
  "moderation",
  "omni-moderation",
];

const ANTHROPIC_PREFIXES = ["claude-"];
const GOOGLE_EXCLUDES = ["embedding", "aqa", "imagen", "veo", "gemma", "learnlm", "live"];
const XAI_PREFIXES = ["grok-"];

function isTextGenerationOpenAiModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (OPENAI_EXCLUDES.some((part) => lower.includes(part))) return false;
  return OPENAI_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isTextGenerationGoogleModel(id: string, methods: string[] = []): boolean {
  const lower = id.toLowerCase();
  if (GOOGLE_EXCLUDES.some((part) => lower.includes(part))) return false;
  if (methods.length > 0 && !methods.includes("generateContent")) return false;
  return lower.includes("gemini");
}

function normalizeGoogleModelId(name: string): string {
  return name.replace(/^models\//, "");
}

function titleCaseModelId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function fetchOpenAiModels(apiKey: string): Promise<ProviderDiscoveredModel[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? [])
    .filter((model) => isTextGenerationOpenAiModel(model.id))
    .map((model) => ({
      id: model.id,
      provider: "openai" as const,
      displayName: model.id.toUpperCase().includes("GPT") ? model.id.replace("gpt-", "GPT-") : titleCaseModelId(model.id),
    }));
}

export async function fetchAnthropicModels(apiKey: string): Promise<ProviderDiscoveredModel[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!response.ok) return [];

  const body = (await response.json()) as {
    data?: Array<{ id: string; display_name?: string }>;
  };

  return (body.data ?? [])
    .filter((model) => ANTHROPIC_PREFIXES.some((prefix) => model.id.startsWith(prefix)))
    .map((model) => ({
      id: model.id,
      provider: "anthropic" as const,
      displayName: model.display_name || titleCaseModelId(model.id),
    }));
}

export async function fetchGoogleModels(apiKey: string): Promise<ProviderDiscoveredModel[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) return [];

  const body = (await response.json()) as {
    models?: Array<{
      name: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (body.models ?? [])
    .map((model) => ({
      rawName: model.name,
      id: normalizeGoogleModelId(model.name),
      methods: model.supportedGenerationMethods ?? [],
      displayName: model.displayName,
      description: model.description,
    }))
    .filter((model) => isTextGenerationGoogleModel(model.id, model.methods))
    .map((model) => ({
      id: model.id,
      provider: "google" as const,
      displayName: model.displayName || titleCaseModelId(model.id),
      description: model.description,
    }));
}

export async function fetchXaiModels(apiKey: string): Promise<ProviderDiscoveredModel[]> {
  const response = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? [])
    .filter((model) => XAI_PREFIXES.some((prefix) => model.id.startsWith(prefix)))
    .map((model) => ({
      id: model.id,
      provider: "xai" as const,
      displayName: titleCaseModelId(model.id),
    }));
}

export async function fetchProviderModels(
  provider: ModelProvider,
  apiKey: string,
): Promise<ProviderDiscoveredModel[]> {
  switch (provider) {
    case "openai":
      return fetchOpenAiModels(apiKey);
    case "anthropic":
      return fetchAnthropicModels(apiKey);
    case "google":
      return fetchGoogleModels(apiKey);
    case "xai":
      return fetchXaiModels(apiKey);
    default:
      return [];
  }
}
