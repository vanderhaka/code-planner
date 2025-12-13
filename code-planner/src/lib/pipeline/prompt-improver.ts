/**
 * Prompt improver stage: enhances user prompt and generates search keywords.
 */

import { callProvider } from "@/lib/providers";
import { resolveModelForProvider } from "@/lib/model-catalog";
import type { ProviderId, ModelSelection } from "./types";
import { safeJsonExtract, validateImproverResponse } from "@/lib/sanitizer";

export type ImproverOutput = {
  improvedUserPrompt: string;
  keywords: string[];
  maxFiles: number;
};

/**
 * Extract keywords from goal text using simple heuristics.
 * Fallback when LLM doesn't return keywords.
 */
function extractKeywordsFallback(goal: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "from", "into", "that", "this", "these", "those",
    "then", "than", "your", "you", "our", "are", "was", "were", "will", "would",
    "should", "could", "can", "cant", "app", "code", "repo", "project", "file",
    "files", "please", "make", "add", "remove", "update", "able", "using", "use",
    "used", "run", "runs",
  ]);

  const tokens = goal
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !stop.has(t));

  return Array.from(new Set(tokens)).slice(0, 12);
}

/**
 * Improve user prompt and generate search keywords.
 * 
 * @param systemPrompt - System prompt for the LLM
 * @param userMessage - Original user message
 * @param provider - Provider to use for improvement
 * @param selectedModels - Model selection map
 * @param modelIdOverride - Optional model ID override
 * @returns Improved prompt, keywords, and max files count
 */
export async function improvePrompt(
  systemPrompt: string,
  userMessage: string,
  provider: ProviderId,
  selectedModels: ModelSelection,
  modelIdOverride: string | null
): Promise<ImproverOutput> {
  const modelId = resolveModelForProvider(provider, selectedModels, modelIdOverride);

  const improverUser = `Goal: ${userMessage.trim()}

Return JSON:
{
  "improved_user_prompt": "clear actionable version",
  "search": {
    "keywords": ["component", "route", "file"],
    "max_files": 12
  }
}`;

  console.log("[Pipeline] Calling prompt improver:", { provider, modelId });
  const improverRaw = await callProvider(provider, systemPrompt, improverUser, modelId);
  const improverParsed = safeJsonExtract(improverRaw);
  const improverJson = validateImproverResponse(improverParsed);

  const improvedUserPrompt =
    improverJson?.improved_user_prompt ?? userMessage.trim();

  const keywords =
    improverJson?.search?.keywords && improverJson.search.keywords.length > 0
      ? improverJson.search.keywords.slice(0, 20)
      : extractKeywordsFallback(userMessage);

  const maxFiles =
    typeof improverJson?.search?.max_files === "number" &&
    Number.isFinite(improverJson.search.max_files)
      ? Math.min(Math.max(Math.floor(improverJson.search.max_files), 4), 25)
      : 12;

  return {
    improvedUserPrompt,
    keywords,
    maxFiles,
  };
}

