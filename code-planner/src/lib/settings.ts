import type { ReviewAgent } from "./review-modes";
import { DEFAULT_AGENT_CONFIG } from "./review-modes";

// Re-export ReviewAgent for convenience
export type { ReviewAgent };

export type ModelId = "openai" | "anthropic" | "google";

export type ModelSelection = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

export type PipelineStageModel = {
  provider: ModelId;
  modelId: string | null;
};

export type PipelineSettings = {
  promptImprover: PipelineStageModel;
  consolidator: PipelineStageModel;
};

export type AgentConfig = {
  enabledAgents: ReviewAgent[];
  includeConfidence: boolean;
};

export type Settings = {
  models: ModelId[];
  selectedModels: ModelSelection;
  pipeline: PipelineSettings;
  reviewMode: "standard" | "agent-based";
  agentConfig: AgentConfig;
};

const SETTINGS_KEY = "code-planner-settings";

const DEFAULT_SETTINGS: Settings = {
  models: ["openai", "anthropic", "google"],
  selectedModels: {
    openai: "gpt-5.2-chat-latest",
    anthropic: "claude-sonnet-4-5",
    google: "gemini-2.5-pro",
  },
  pipeline: {
    promptImprover: { provider: "openai", modelId: "gpt-5.2-chat-latest" },
    consolidator: { provider: "openai", modelId: "gpt-5.2-chat-latest" },
  },
  reviewMode: "standard",
  agentConfig: DEFAULT_AGENT_CONFIG,
};

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;

    const models = Array.isArray(parsed.models)
      ? (parsed.models.filter((m) => m === "openai" || m === "anthropic" || m === "google") as ModelId[])
      : DEFAULT_SETTINGS.models;

    const selectedModels: ModelSelection = parsed.selectedModels
      ? {
          openai: parsed.selectedModels.openai ?? DEFAULT_SETTINGS.selectedModels.openai,
          anthropic: parsed.selectedModels.anthropic ?? DEFAULT_SETTINGS.selectedModels.anthropic,
          google: parsed.selectedModels.google ?? DEFAULT_SETTINGS.selectedModels.google,
        }
      : DEFAULT_SETTINGS.selectedModels;

    const pipeline: PipelineSettings = parsed.pipeline
      ? {
          promptImprover: {
            provider: parsed.pipeline.promptImprover?.provider ?? DEFAULT_SETTINGS.pipeline.promptImprover.provider,
            modelId: parsed.pipeline.promptImprover?.modelId ?? DEFAULT_SETTINGS.pipeline.promptImprover.modelId,
          },
          consolidator: {
            provider: parsed.pipeline.consolidator?.provider ?? DEFAULT_SETTINGS.pipeline.consolidator.provider,
            modelId: parsed.pipeline.consolidator?.modelId ?? DEFAULT_SETTINGS.pipeline.consolidator.modelId,
          },
        }
      : DEFAULT_SETTINGS.pipeline;

    const reviewMode = parsed.reviewMode === "agent-based" ? "agent-based" : "standard";
    
    const agentConfig: AgentConfig = parsed.agentConfig
      ? {
          enabledAgents: Array.isArray(parsed.agentConfig.enabledAgents)
            ? (parsed.agentConfig.enabledAgents.filter((a): a is ReviewAgent =>
                a === "bug-detector" ||
                a === "security-auditor" ||
                a === "performance-optimizer" ||
                a === "refactoring-architect"
              ))
            : DEFAULT_SETTINGS.agentConfig.enabledAgents,
          includeConfidence: parsed.agentConfig.includeConfidence ?? DEFAULT_SETTINGS.agentConfig.includeConfidence,
        }
      : DEFAULT_SETTINGS.agentConfig;

    return {
      models: models.length ? models : DEFAULT_SETTINGS.models,
      selectedModels,
      pipeline,
      reviewMode,
      agentConfig,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
