/**
 * Centralized model catalog for all providers.
 * 
 * This module maintains allowlists of valid, supported model IDs to avoid
 * brittle filtering and hard failures from invalid model IDs.
 */

export type ProviderId = "openai" | "anthropic" | "google";

export type ModelOption = {
  id: string;
  name: string;
};

/**
 * OpenAI chat-capable models (for /v1/chat/completions endpoint).
 * 
 * GPT-5 series only - these are the current flagship models as of December 2025.
 * Only includes models with explicit chat capability (chat-latest, pro, mini).
 */
export const OPENAI_CHAT_MODELS: ModelOption[] = [
  // GPT-5.2 family (latest)
  { id: "gpt-5.2-chat-latest", name: "GPT-5.2 Chat (Latest)" },
  { id: "gpt-5.2-pro", name: "GPT-5.2 Pro" },
  { id: "gpt-5.2-pro-2025-12-11", name: "GPT-5.2 Pro (2025-12-11)" },
  
  // GPT-5.1 family
  { id: "gpt-5.1-chat-latest", name: "GPT-5.1 Chat (Latest)" },
  
  // GPT-5 family
  { id: "gpt-5-chat-latest", name: "GPT-5 Chat (Latest)" },
  { id: "gpt-5-pro", name: "GPT-5 Pro" },
  { id: "gpt-5-pro-2025-10-06", name: "GPT-5 Pro (2025-10-06)" },
  { id: "gpt-5-mini", name: "GPT-5 Mini" },
  { id: "gpt-5-mini-2025-08-07", name: "GPT-5 Mini (2025-08-07)" },
];

/**
 * Anthropic Claude models.
 * 
 * Anthropic doesn't provide a models list API, so we hardcode supported models.
 * Claude 4.5 series only - current flagship models as of December 2025.
 */
export const ANTHROPIC_MODELS: ModelOption[] = [
  // Claude 4.5 Models (latest)
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];

/**
 * Default model IDs for each provider.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-5.2-chat-latest";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
export const DEFAULT_GOOGLE_MODEL = "gemini-2.5-pro";

/**
 * Get the default model ID for a provider.
 */
export function getDefaultModel(provider: ProviderId): string {
  switch (provider) {
    case "openai":
      return DEFAULT_OPENAI_MODEL;
    case "anthropic":
      return DEFAULT_ANTHROPIC_MODEL;
    case "google":
      return DEFAULT_GOOGLE_MODEL;
  }
}

/**
 * Validate that a model ID is in the allowlist for a provider.
 * Returns the model ID if valid, or the default if invalid/null.
 */
export function validateModelId(provider: ProviderId, modelId: string | null | undefined): string {
  if (!modelId) {
    return getDefaultModel(provider);
  }
  
  switch (provider) {
    case "openai": {
      const isValid = OPENAI_CHAT_MODELS.some((m) => m.id === modelId);
      return isValid ? modelId : getDefaultModel(provider);
    }
    case "anthropic": {
      const isValid = ANTHROPIC_MODELS.some((m) => m.id === modelId);
      return isValid ? modelId : getDefaultModel(provider);
    }
    case "google":
      // Google models are fetched dynamically, so we accept any non-empty string
      return modelId || getDefaultModel(provider);
    default:
      return getDefaultModel(provider);
  }
}

