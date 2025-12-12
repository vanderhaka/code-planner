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
 * OpenAI's /v1/models endpoint is an inventory and does not reliably encode
 * chat capability. We maintain an allowlist of known chat-capable models.
 * 
 * Based on OpenAI docs as of December 2025:
 * - gpt-4o family (multimodal, chat-capable)
 * - gpt-4-turbo family (chat-capable)
 * - gpt-4 family (chat-capable)
 * - gpt-3.5-turbo family (chat-capable)
 * - o1 and o3 families (reasoning models, chat-capable)
 */
export const OPENAI_CHAT_MODELS: ModelOption[] = [
  // GPT-4o family (latest flagship)
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-2024-05-13", name: "GPT-4o (2024-05-13)" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "gpt-4o-mini-2024-07-18", name: "GPT-4o Mini (2024-07-18)" },
  
  // GPT-4 Turbo family
  { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  { id: "gpt-4-turbo-2024-04-09", name: "GPT-4 Turbo (2024-04-09)" },
  { id: "gpt-4-turbo-preview", name: "GPT-4 Turbo Preview" },
  { id: "gpt-4-0125-preview", name: "GPT-4 Turbo (2024-01-25)" },
  { id: "gpt-4-1106-preview", name: "GPT-4 Turbo (2023-11-06)" },
  
  // GPT-4 family
  { id: "gpt-4", name: "GPT-4" },
  { id: "gpt-4-0613", name: "GPT-4 (2023-06-13)" },
  { id: "gpt-4-0314", name: "GPT-4 (2023-03-14)" },
  
  // GPT-3.5 Turbo family
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
  { id: "gpt-3.5-turbo-0125", name: "GPT-3.5 Turbo (2024-01-25)" },
  { id: "gpt-3.5-turbo-1106", name: "GPT-3.5 Turbo (2023-11-06)" },
  
  // Reasoning models (o1, o3)
  { id: "o1-preview", name: "O1 Preview" },
  { id: "o1-mini", name: "O1 Mini" },
  { id: "o3-mini", name: "O3 Mini" },
];

/**
 * Anthropic Claude models.
 * 
 * Anthropic doesn't provide a models list API, so we hardcode supported models.
 * These are the real, currently supported model IDs from Anthropic's API.
 * 
 * Based on Anthropic docs as of December 2025.
 */
export const ANTHROPIC_MODELS: ModelOption[] = [
  // Claude 4 Models
  { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1" },
  { id: "claude-opus-4-1", name: "Claude Opus 4.1 (alias)" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4.0" },
  { id: "claude-opus-4-0", name: "Claude Opus 4.0 (alias)" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4.0" },
  { id: "claude-sonnet-4-0", name: "Claude Sonnet 4.0 (alias)" },
  
  // Claude 3.7 Models
  { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
  { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet (latest)" },
  
  // Claude 3.5 Models
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku (latest)" },
  { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet (latest)" },
  
  // Claude 3 Models
  { id: "claude-3-opus-latest", name: "Claude 3 Opus (latest)" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
];

/**
 * Default model IDs for each provider.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-0";
export const DEFAULT_GOOGLE_MODEL = "gemini-2.0-flash-exp";

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
