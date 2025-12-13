/**
 * Model runner: execute multiple models in parallel.
 */

import { callProvider, buildContext } from "@/lib/providers";
import { resolveModelForProvider } from "@/lib/model-catalog";
import type { ProviderId, ModelSelection, FileWithContent } from "./types";

/**
 * Run all enabled models with the given prompt and context.
 * 
 * @param models - List of provider IDs to run
 * @param systemPrompt - System prompt
 * @param improvedUserPrompt - Improved user prompt
 * @param files - Files to include as context
 * @param selectedModels - Model selection map
 * @returns Array of model outputs
 */
export async function runModels(
  models: ProviderId[],
  systemPrompt: string,
  improvedUserPrompt: string,
  files: FileWithContent[],
  selectedModels: ModelSelection
): Promise<Array<{ model: ProviderId; output: string }>> {
  const context = buildContext(files);
  const finalUserPrompt = `${improvedUserPrompt}\n\n${context}`;

  console.log("[Pipeline] Calling models:", models);
  const results = await Promise.all(
    models.map(async (m) => {
      const modelId = resolveModelForProvider(m, selectedModels, null);
      console.log("[Pipeline] Calling model:", { provider: m, modelId });
      const output = await callProvider(m, systemPrompt, finalUserPrompt, modelId);
      return { model: m, output };
    })
  );

  return results;
}

