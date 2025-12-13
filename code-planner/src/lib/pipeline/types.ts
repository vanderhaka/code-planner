/**
 * Shared types for the pipeline execution system.
 */

import type { ProviderId } from "@/lib/model-catalog";

// Re-export for convenience
export type { ProviderId };

export type ModelSelection = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

export type PipelineStageModel = {
  provider: ProviderId;
  modelId: string | null;
};

export type PipelineSettings = {
  promptImprover: PipelineStageModel;
  consolidator: PipelineStageModel;
};

export type PipelineRunRequest = {
  repo: string; // "owner/name"
  branch: string;
  template: {
    systemPrompt: string;
  };
  userMessage: string;
  models: ProviderId[];
  selectedModels: ModelSelection;
  pipeline: PipelineSettings;
};

export type TreeItem = {
  path: string;
  type: "blob" | "tree" | string;
  sha: string;
};

export type FileWithContent = {
  path: string;
  content: string;
};

export type PipelineProgress = {
  stage: "improving" | "searching" | "loading" | "running" | "consolidating" | "complete";
  message: string;
  progress?: number; // 0-100
};

export type PipelineResult = {
  results: Array<{ model: ProviderId; output: string }>;
  consolidated: string;
  meta: {
    repo: string;
    branch: string;
    selectedFiles: string[];
    keywords: string[];
    promptImprover: { provider: ProviderId; modelId: string };
    consolidator: { provider: ProviderId; modelId: string };
    warning?: string;
  };
};

