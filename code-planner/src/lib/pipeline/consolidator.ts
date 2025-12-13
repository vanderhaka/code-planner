/**
 * Consolidator: merge multiple model outputs into a single synthesis.
 */

import { callProvider } from "@/lib/providers";
import { resolveModelForProvider } from "@/lib/model-catalog";
import type { ProviderId, ModelSelection } from "./types";

/**
 * Consolidate multiple model outputs into a single synthesis.
 * 
 * @param results - Array of model outputs
 * @param systemPrompt - System prompt
 * @param provider - Provider to use for consolidation
 * @param selectedModels - Model selection map
 * @param modelIdOverride - Optional model ID override
 * @returns Consolidated output
 */
export async function consolidate(
  results: Array<{ model: ProviderId; output: string }>,
  systemPrompt: string,
  provider: ProviderId,
  selectedModels: ModelSelection,
  modelIdOverride: string | null
): Promise<string> {
  const consolidationPrompt = `You are given independent reviews of the same code/files. Synthesize them into a single, concise, actionable plan. Preserve the most important insights and resolve any conflicts. Do not add new opinions beyond what the reviews contain.

Reviews:
${results.map((r) => `--- ${r.model.toUpperCase()} ---\n${r.output}`).join("\n\n")}

Synthesized plan:`;

  const modelId = resolveModelForProvider(provider, selectedModels, modelIdOverride);
  console.log("[Pipeline] Calling consolidator:", { provider, modelId });
  const consolidated = await callProvider(
    provider,
    systemPrompt,
    consolidationPrompt,
    modelId
  );

  return consolidated;
}

