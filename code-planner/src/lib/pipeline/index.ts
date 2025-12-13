/**
 * Pipeline orchestrator: coordinates all pipeline stages.
 */

import type { PipelineRunRequest, PipelineProgress, PipelineResult } from "./types";
import { improvePrompt } from "./prompt-improver";
import { fetchRepoTree, rankFiles } from "./repo-search";
import { fetchFilesWithEarlyTermination } from "./file-loader";
import { runModels } from "./model-runner";
import { consolidate } from "./consolidator";
import { resolveModelForProvider } from "@/lib/model-catalog";

export type ProgressWriter = (progress: PipelineProgress) => void;

/**
 * Execute the full pipeline with progress updates.
 * 
 * @param request - Validated pipeline request
 * @param sessionToken - GitHub session token
 * @param onProgress - Callback for progress updates
 * @returns Pipeline result
 */
export async function executePipeline(
  request: PipelineRunRequest,
  sessionToken: string,
  onProgress?: ProgressWriter
): Promise<PipelineResult> {
  const { repo, branch, template, userMessage, models, selectedModels, pipeline } = request;
  const [owner, repoName] = repo.split("/");

  // Stage 1: Improve prompt
  onProgress?.({ stage: "improving", message: "Improving prompt and generating search keywords..." });
  const { improvedUserPrompt, keywords, maxFiles } = await improvePrompt(
    template.systemPrompt,
    userMessage,
    pipeline.promptImprover.provider,
    selectedModels,
    pipeline.promptImprover.modelId
  );

  // Stage 2: Search repository
  onProgress?.({ stage: "searching", message: "Searching repository for relevant files..." });
  const tree = await fetchRepoTree(sessionToken, owner, repoName, branch);
  const rankedPaths = rankFiles(tree, keywords, maxFiles);

  // Stage 3: Load files
  onProgress?.({
    stage: "loading",
    message: `Loading ${rankedPaths.length} files...`,
    progress: 0,
  });

  let files: Array<{ path: string; content: string }>;
  let warning: string | undefined;

  if (rankedPaths.length === 0) {
    // Allow pipeline to run with prompt-only
    warning = "No relevant files found. Running with prompt-only context.";
    files = [];
  } else {
    files = await fetchFilesWithEarlyTermination(
      rankedPaths,
      sessionToken,
      owner,
      repoName,
      branch
    );

    if (files.length === 0) {
      warning = "Could not load any files. Running with prompt-only context.";
    }
  }

  // Stage 4: Run models
  onProgress?.({
    stage: "running",
    message: `Running ${models.length} model(s)...`,
    progress: 50,
  });

  const results = await runModels(
    models,
    template.systemPrompt,
    improvedUserPrompt,
    files,
    selectedModels
  );

  // Stage 5: Consolidate
  onProgress?.({ stage: "consolidating", message: "Consolidating results...", progress: 90 });
  const consolidated = await consolidate(
    results,
    template.systemPrompt,
    pipeline.consolidator.provider,
    selectedModels,
    pipeline.consolidator.modelId
  );

  onProgress?.({ stage: "complete", message: "Pipeline complete", progress: 100 });

  return {
    results,
    consolidated,
    meta: {
      repo,
      branch,
      selectedFiles: files.map((f) => f.path),
      keywords,
      promptImprover: {
        provider: pipeline.promptImprover.provider,
        modelId: resolveModelForProvider(
          pipeline.promptImprover.provider,
          selectedModels,
          pipeline.promptImprover.modelId
        ),
      },
      consolidator: {
        provider: pipeline.consolidator.provider,
        modelId: resolveModelForProvider(
          pipeline.consolidator.provider,
          selectedModels,
          pipeline.consolidator.modelId
        ),
      },
      warning,
    },
  };
}

