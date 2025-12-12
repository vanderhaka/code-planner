"use client";

import { useEffect, useCallback, useState } from "react";
import type { ModelId, Settings } from "@/lib/settings";

const MODEL_LABEL: Record<ModelId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

type ModelOption = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
};

export function SettingsModal({ open, settings, onClose, onSave }: Props) {
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

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  const fetchModels = useCallback(async (provider: ModelId) => {
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
    } catch (e) {
      setModelErrors((prev) => ({
        ...prev,
        [provider]: (e as Error).message,
      }));
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Fetch models for all providers when modal opens
    (["openai", "anthropic", "google"] as ModelId[]).forEach((provider) => {
      if (availableModels[provider].length === 0 && !loadingModels[provider]) {
        fetchModels(provider);
      }
    });
  }, [open, fetchModels, availableModels, loadingModels]);

  if (!open) return null;

  const enabled = new Set(settings.models);

  const ensureEnabled = (id: ModelId) => {
    if (enabled.has(id)) return settings.models;
    return [...settings.models, id];
  };

  const toggle = (id: ModelId) => {
    const next = new Set(enabled);
    if (next.has(id)) {
      next.delete(id);
      // Clear selected model when disabling provider
      onSave({
        models: Array.from(next),
        selectedModels: {
          ...settings.selectedModels,
          [id]: null,
        },
      });
    } else {
      next.add(id);
      // Fetch models if not already loaded
      if (availableModels[id].length === 0 && !loadingModels[id]) {
        fetchModels(id);
      }
      onSave({
        models: Array.from(next),
        selectedModels: settings.selectedModels,
      });
    }
  };

  const handleModelChange = (provider: ModelId, modelId: string) => {
    onSave({
      models: settings.models,
      selectedModels: {
        ...settings.selectedModels,
        [provider]: modelId || null,
      },
      pipeline: settings.pipeline,
    });
  };

  const handlePipelineProviderChange = (stage: "promptImprover" | "consolidator", provider: ModelId) => {
    const nextModels = ensureEnabled(provider);
    const nextModelId =
      settings.selectedModels[provider] ??
      availableModels[provider][0]?.id ??
      null;
    onSave({
      models: nextModels,
      selectedModels: settings.selectedModels,
      pipeline: {
        ...settings.pipeline,
        [stage]: { provider, modelId: nextModelId },
      },
    });
  };

  const handlePipelineModelChange = (stage: "promptImprover" | "consolidator", modelId: string) => {
    onSave({
      models: settings.models,
      selectedModels: settings.selectedModels,
      pipeline: {
        ...settings.pipeline,
        [stage]: { ...settings.pipeline[stage], modelId: modelId || null },
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="card-title" id="settings-modal-title">Settings</div>
              <div className="card-subtitle">Choose which models run by default.</div>
            </div>
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 rounded-xl border border-neutral-200 p-3">
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

          <div className="space-y-4">
            {(Object.keys(MODEL_LABEL) as ModelId[]).map((id) => {
              const isEnabled = enabled.has(id);
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
                      onChange={() => toggle(id)}
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
          </div>

          <div className="mt-4 text-xs text-neutral-600">
            If you disable all models, runs will be blocked. Select a specific model for each enabled provider.
          </div>
        </div>
      </div>
    </div>
  );
}
