"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { ModelId, Settings } from "@/lib/settings";
import { getSettings, saveSettings } from "@/lib/settings";
import type { ReviewAgent } from "@/lib/review-modes";
import { getTemplates, deleteTemplate, type PromptTemplate } from "@/lib/prompt-templates";
import Link from "next/link";

const MODEL_LABEL: Record<ModelId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

type ModelOption = {
  id: string;
  name: string;
};

type TabId = "models" | "pipeline" | "agents" | "templates";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["models", "pipeline", "agents", "templates"].includes(tabParam) ? tabParam : "models");
  const [settings, setSettings] = useState<Settings>(() => getSettings());
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [availableModels, setAvailableModels] = useState<Record<ModelId, ModelOption[]>>({
    openai: [],
    anthropic: [],
    google: [],
  });
  const [loadingModels, setLoadingModels] = useState<Record<ModelId, boolean>>({
    openai: false,
    anthropic: false,
    google: false,
  });
  const [modelErrors, setModelErrors] = useState<Record<ModelId, string | null>>({
    openai: null,
    anthropic: null,
    google: null,
  });
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  
  // Track which providers have been fetched to prevent infinite loops
  const fetchedProvidersRef = useRef<Set<ModelId>>(new Set());

  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  // Refresh templates when returning from template edit/create
  useEffect(() => {
    const handleFocus = () => {
      setTemplates(getTemplates());
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchModels = useCallback(async (provider: ModelId) => {
    // Skip if already fetched
    if (fetchedProvidersRef.current.has(provider)) {
      return;
    }
    
    setLoadingModels((prev) => ({ ...prev, [provider]: true }));
    setModelErrors((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch(`/api/models/${provider}`);
      if (!res.ok) {
        const error = await res.json();
        setModelErrors((prev) => ({
          ...prev,
          [provider]: error.error || `Failed to load ${MODEL_LABEL[provider]} models`,
        }));
        return;
      }
      const data = (await res.json()) as { models: ModelOption[] };
      setAvailableModels((prev) => ({ ...prev, [provider]: data.models }));
      fetchedProvidersRef.current.add(provider);
    } catch (e) {
      setModelErrors((prev) => ({
        ...prev,
        [provider]: (e as Error).message,
      }));
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  // Fetch models for all providers on mount
  useEffect(() => {
    (["openai", "anthropic", "google"] as ModelId[]).forEach((provider) => {
      if (!fetchedProvidersRef.current.has(provider)) {
        fetchModels(provider);
      }
    });
  }, [fetchModels]);

  const handleSaveSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const handleModelToggle = (id: ModelId) => {
    const enabled = new Set(settings.models);
    if (enabled.has(id)) {
      enabled.delete(id);
      handleSaveSettings({
        ...settings,
        models: Array.from(enabled),
        selectedModels: {
          ...settings.selectedModels,
          [id]: null,
        },
      });
    } else {
      enabled.add(id);
      if (availableModels[id].length === 0 && !loadingModels[id]) {
        fetchModels(id);
      }
      handleSaveSettings({
        ...settings,
        models: Array.from(enabled),
      });
    }
  };

  const handleModelChange = (provider: ModelId, modelId: string) => {
    handleSaveSettings({
      ...settings,
      selectedModels: {
        ...settings.selectedModels,
        [provider]: modelId || null,
      },
    });
  };

  const handlePipelineProviderChange = (stage: "promptImprover" | "consolidator", provider: ModelId) => {
    const nextModels = settings.models.includes(provider)
      ? settings.models
      : [...settings.models, provider];
    const nextModelId =
      settings.selectedModels[provider] ??
      availableModels[provider][0]?.id ??
      null;
    handleSaveSettings({
      ...settings,
      models: nextModels,
      pipeline: {
        ...settings.pipeline,
        [stage]: { provider, modelId: nextModelId },
      },
    });
  };

  const handlePipelineModelChange = (stage: "promptImprover" | "consolidator", modelId: string) => {
    handleSaveSettings({
      ...settings,
      pipeline: {
        ...settings.pipeline,
        [stage]: { ...settings.pipeline[stage], modelId: modelId || null },
      },
    });
  };

  const handleAgentToggle = (agent: ReviewAgent) => {
    const enabled = settings.agentConfig.enabledAgents.includes(agent);
    const newAgents = enabled
      ? settings.agentConfig.enabledAgents.filter((a) => a !== agent)
      : [...settings.agentConfig.enabledAgents, agent];

    handleSaveSettings({
      ...settings,
      agentConfig: {
        ...settings.agentConfig,
        enabledAgents: newAgents,
      },
    });
  };

  const handleConfidenceToggle = () => {
    handleSaveSettings({
      ...settings,
      agentConfig: {
        ...settings.agentConfig,
        includeConfidence: !settings.agentConfig.includeConfidence,
      },
    });
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
    setTemplates(getTemplates());
    setTemplateToDelete(null);
  };

  const AGENT_LABELS: Record<ReviewAgent, string> = {
    "bug-detector": "Bug Detector",
    "security-auditor": "Security Auditor",
    "performance-optimizer": "Performance Optimizer",
    "refactoring-architect": "Refactoring Architect",
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "models", label: "Models" },
    { id: "pipeline", label: "Pipeline" },
    { id: "agents", label: "Agents" },
    { id: "templates", label: "Templates" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Configure models, pipeline, agents, and templates.
            </p>
          </div>
          <Link href="/" className="btn">
            Back to Home
          </Link>
        </div>

        <div className="card">
          <div className="border-b border-neutral-200">
            <div className="flex gap-1 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {activeTab === "models" && (
              <div className="space-y-4">
                {(Object.keys(MODEL_LABEL) as ModelId[]).map((id) => {
                  const isEnabled = settings.models.includes(id);
                  const isLoading = loadingModels[id];
                  const error = modelErrors[id];
                  const models = availableModels[id];
                  const selectedModel = settings.selectedModels[id];

                  return (
                    <div key={id} className="rounded-xl border border-neutral-200 p-3">
                      <label className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-sm font-medium text-neutral-900">{MODEL_LABEL[id]}</div>
                          <div className="text-xs text-neutral-600">Enable/disable for runs</div>
                        </div>
                        <input
                          className="h-4 w-4 accent-neutral-900"
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleModelToggle(id)}
                        />
                      </label>

                      {isEnabled && (
                        <div className="mt-3 pt-3 border-t border-neutral-100">
                          <label htmlFor={`model-select-${id}`} className="mb-1 block text-xs font-medium text-neutral-700">
                            Model
                          </label>
                          {isLoading ? (
                            <div className="flex items-center gap-2 text-xs text-neutral-600 py-2">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Loading models...
                            </div>
                          ) : error ? (
                            <div className="text-xs text-red-600 py-2">{error}</div>
                          ) : models.length > 0 ? (
                            <select
                              id={`model-select-${id}`}
                              value={selectedModel || ""}
                              onChange={(e) => handleModelChange(id, e.target.value)}
                              className="input text-xs"
                            >
                              <option value="">Select a model</option>
                              {models.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-xs text-neutral-500 py-2">No models available</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="text-xs text-neutral-600">
                  If you disable all models, runs will be blocked. Select a specific model for each enabled provider.
                </div>
              </div>
            )}

            {activeTab === "pipeline" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-sm font-medium text-neutral-900">Pipeline models</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Choose which model is used to (1) improve the prompt + generate search JSON, and (2) consolidate outputs.
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div>
                      <div className="text-xs font-medium text-neutral-700">Prompt improver</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select
                          className="input text-xs"
                          value={settings.pipeline.promptImprover.provider}
                          onChange={(e) => handlePipelineProviderChange("promptImprover", e.target.value as ModelId)}
                        >
                          {(Object.keys(MODEL_LABEL) as ModelId[]).map((id) => (
                            <option key={id} value={id}>
                              {MODEL_LABEL[id]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input text-xs"
                          value={settings.pipeline.promptImprover.modelId ?? ""}
                          onChange={(e) => handlePipelineModelChange("promptImprover", e.target.value)}
                        >
                          <option value="">Default</option>
                          {availableModels[settings.pipeline.promptImprover.provider].map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-neutral-700">Consolidator</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select
                          className="input text-xs"
                          value={settings.pipeline.consolidator.provider}
                          onChange={(e) => handlePipelineProviderChange("consolidator", e.target.value as ModelId)}
                        >
                          {(Object.keys(MODEL_LABEL) as ModelId[]).map((id) => (
                            <option key={id} value={id}>
                              {MODEL_LABEL[id]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input text-xs"
                          value={settings.pipeline.consolidator.modelId ?? ""}
                          onChange={(e) => handlePipelineModelChange("consolidator", e.target.value)}
                        >
                          <option value="">Default</option>
                          {availableModels[settings.pipeline.consolidator.provider].map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-sm font-medium text-neutral-900">Agent-Based Review</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Configure which specialized agents run in agent-based review mode.
                  </div>

                  <div className="mt-4 space-y-2">
                    {(Object.keys(AGENT_LABELS) as ReviewAgent[]).map((agent) => {
                      const isEnabled = settings.agentConfig.enabledAgents.includes(agent);
                      return (
                        <label key={agent} className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-neutral-900">{AGENT_LABELS[agent]}</div>
                            <div className="text-xs text-neutral-600">
                              {agent === "bug-detector" && "Detects bugs, logic errors, and AI slop"}
                              {agent === "security-auditor" && "Identifies security vulnerabilities"}
                              {agent === "performance-optimizer" && "Finds performance bottlenecks"}
                              {agent === "refactoring-architect" && "Suggests code organization improvements"}
                            </div>
                          </div>
                          <input
                            className="h-4 w-4 accent-neutral-900"
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => handleAgentToggle(agent)}
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-100">
                    <label className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-neutral-900">Confidence Evaluation</div>
                        <div className="text-xs text-neutral-600">
                          Include confidence scoring for findings (slower but more thorough)
                        </div>
                      </div>
                      <input
                        className="h-4 w-4 accent-neutral-900"
                        type="checkbox"
                        checked={settings.agentConfig.includeConfidence}
                        onChange={handleConfidenceToggle}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "templates" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-neutral-900">Prompt Templates</div>
                    <div className="text-xs text-neutral-600">
                      Templates define how AI models review your code.
                    </div>
                  </div>
                  <Link href="/templates/new" className="btn btn-primary text-xs">
                    + New Template
                  </Link>
                </div>

                {templates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
                    <p className="text-sm text-neutral-600">No templates yet</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Templates define how AI models review your code.
                    </p>
                    <Link href="/templates/new" className="btn btn-primary mt-4 text-xs">
                      Create your first template
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:bg-neutral-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-neutral-900">{t.name}</div>
                          {t.description ? (
                            <div className="mt-1 text-xs text-neutral-500">{t.description}</div>
                          ) : null}
                        </div>
                        <div className="ml-4 flex gap-2">
                          <Link
                            href={`/templates/${t.id}/edit`}
                            className="btn text-xs"
                            type="button"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="btn btn-danger text-xs"
                            onClick={() => setTemplateToDelete(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-sm" role="dialog" aria-modal="true">
            <div className="p-5">
              <h3 className="text-lg font-semibold">Delete template?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                This template will be permanently removed.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTemplateToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteTemplate(templateToDelete)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

