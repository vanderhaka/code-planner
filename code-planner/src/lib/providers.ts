/**
 * Shared provider client implementations for LLM API calls.
 * 
 * This module centralizes provider call logic to prevent drift between routes
 * and ensure consistent timeout handling, validation, and error handling.
 */

import {
  type ProviderId,
  validateModelId,
} from "@/lib/model-catalog";

export type ProviderCallOptions = {
  timeout?: number;
};

/**
 * Build context string from file array.
 */
export function buildContext(files: Array<{ path: string; content: string }>): string {
  return files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n");
}

/**
 * Call OpenAI chat completions API.
 */
async function callOpenAI(
  system: string,
  user: string,
  modelId: string,
  options?: ProviderCallOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const timeout = options?.timeout ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`OpenAI API error (${res.status}):`, errorText);
      throw new Error(`OpenAI error: ${res.status} - ${errorText}`);
    }

    const data = (await res.json()) as any;
    if (!data.choices?.length) {
      throw new Error("OpenAI returned no choices");
    }
    const content = data.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenAI returned empty or invalid content");
    }
    return content;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("OpenAI request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Anthropic messages API.
 */
async function callAnthropic(
  system: string,
  user: string,
  modelId: string,
  options?: ProviderCallOptions
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const timeout = options?.timeout ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Anthropic API error (${res.status}):`, errorText);
      throw new Error(`Anthropic error: ${res.status} - ${errorText}`);
    }

    const data = (await res.json()) as any;
    if (!data.content?.length) {
      throw new Error("Anthropic returned no content");
    }
    const text = data.content[0]?.text;
    if (!text || typeof text !== "string") {
      throw new Error("Anthropic returned empty or invalid content");
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Anthropic request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Google Generative AI API.
 */
async function callGoogle(
  system: string,
  user: string,
  modelId: string,
  options?: ProviderCallOptions
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY missing");

  const timeout = options?.timeout ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `System: ${system}\n\nUser: ${user}` }] }],
          generationConfig: { maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Google AI API error (${res.status}):`, errorText);
      throw new Error(`Google error: ${res.status} - ${errorText}`);
    }

    const data = (await res.json()) as any;
    if (!data.candidates?.length) {
      throw new Error("Google returned no candidates");
    }
    const text = data.candidates[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== "string") {
      throw new Error("Google returned empty or invalid content");
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Google AI request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call a provider with validated model ID and consistent error handling.
 * 
 * @param provider - The provider to call
 * @param system - System prompt
 * @param user - User prompt
 * @param modelId - Model ID (will be validated and defaulted if invalid/null)
 * @param options - Optional timeout configuration
 * @returns The generated text content
 */
export async function callProvider(
  provider: ProviderId,
  system: string,
  user: string,
  modelId: string | null,
  options?: ProviderCallOptions
): Promise<string> {
  // Validate and resolve model ID
  const validatedModelId = validateModelId(provider, modelId);

  switch (provider) {
    case "openai":
      return callOpenAI(system, user, validatedModelId, options);
    case "anthropic":
      return callAnthropic(system, user, validatedModelId, options);
    case "google":
      return callGoogle(system, user, validatedModelId, options);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

