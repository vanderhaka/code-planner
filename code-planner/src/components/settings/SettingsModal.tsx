/**
 * Settings modal with draft-then-save pattern.
 * Changes are held in local state until user explicitly saves or cancels.
 */

"use client";

import { useEffect, useCallback, useState } from "react";
import type { ModelId, Settings } from "@/lib/settings";
import type { ReviewAgent } from "@/lib/review-modes";
import { useModels } from "./useModels";
import { ProviderSection } from "./ProviderSection";
import { PipelineModelSelector } from "./PipelineModelSelector";
import { AgentConfigSection } from "./AgentConfigSection";

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
};

export function SettingsModal({ open, settings, onClose, onSave }: Props) {
  // Draft state - only saved when user clicks "Save"
  const [draft, setDraft] = useState<Settings>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  const { availableModels, loadingModels, modelErrors, fetchModels } = useModels(open);

  // Reset draft when modal opens or settings prop changes
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setHasChanges(false);
    }
  }, [open, settings]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        if (hasChanges) {
          // Could show confirmation here, but for now just discard
          setHasChanges(false);
        }
        onClose();
      }
    },
    [open, hasChanges, onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  const ensureEnabled = (id: ModelId) => {
    if (draft.models.includes(id)) return draft.models;
    return [...draft.models, id];
  };

  const toggle = (id: ModelId) => {
    setDraft((prev) => {
      const enabled = new Set(prev.models);
      if (enabled.has(id)) {
        enabled.delete(id);
        return {
          ...prev,
          models: Array.from(enabled),
          selectedModels: {
            ...prev.selectedModels,
            [id]: null,
          },
        };
      } else {
        enabled.add(id);
        return {
          ...prev,
          models: Array.from(enabled),
        };
      }
    });
    setHasChanges(true);
  };

  const handleModelChange = (provider: ModelId, modelId: string) => {
    setDraft((prev) => ({
      ...prev,
      selectedModels: {
        ...prev.selectedModels,
        [provider]: modelId || null,
      },
    }));
    setHasChanges(true);
  };

  const handlePipelineProviderChange = (stage: "promptImprover" | "consolidator", provider: ModelId) => {
    setDraft((prev) => {
      const nextModels = ensureEnabled(provider);
      const nextModelId =
        prev.selectedModels[provider] ??
        availableModels[provider][0]?.id ??
        null;
      return {
        ...prev,
        models: nextModels,
        pipeline: {
          ...prev.pipeline,
          [stage]: { provider, modelId: nextModelId },
        },
      };
    });
    setHasChanges(true);
  };

  const handlePipelineModelChange = (stage: "promptImprover" | "consolidator", modelId: string) => {
    setDraft((prev) => ({
      ...prev,
      pipeline: {
        ...prev.pipeline,
        [stage]: { ...prev.pipeline[stage], modelId: modelId || null },
      },
    }));
    setHasChanges(true);
  };

  const handleAgentToggle = (agent: ReviewAgent) => {
    setDraft((prev) => {
      const enabled = prev.agentConfig.enabledAgents.includes(agent);
      const newAgents = enabled
        ? prev.agentConfig.enabledAgents.filter((a) => a !== agent)
        : [...prev.agentConfig.enabledAgents, agent];
      return {
        ...prev,
        agentConfig: {
          ...prev.agentConfig,
          enabledAgents: newAgents,
        },
      };
    });
    setHasChanges(true);
  };

  const handleConfidenceToggle = () => {
    setDraft((prev) => ({
      ...prev,
      agentConfig: {
        ...prev.agentConfig,
        includeConfidence: !prev.agentConfig.includeConfidence,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(draft);
    setHasChanges(false);
    onClose();
  };

  const handleCancel = () => {
    setDraft(settings);
    setHasChanges(false);
    onClose();
  };

  if (!open) return null;

  const enabled = new Set(draft.models);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      // Don't close on backdrop click - require explicit cancel/save
    >
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="card-title" id="settings-modal-title">Settings</div>
              <div className="card-subtitle">Choose which models run by default.</div>
            </div>
            <button className="btn" type="button" onClick={handleCancel}>
              Cancel
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
              <PipelineModelSelector
                stage="promptImprover"
                label="Prompt improver"
                settings={draft}
                availableModels={availableModels}
                loadingModels={loadingModels}
                onProviderChange={handlePipelineProviderChange}
                onModelChange={handlePipelineModelChange}
              />

              <PipelineModelSelector
                stage="consolidator"
                label="Consolidator"
                settings={draft}
                availableModels={availableModels}
                loadingModels={loadingModels}
                onProviderChange={handlePipelineProviderChange}
                onModelChange={handlePipelineModelChange}
              />
            </div>
          </div>

          <div className="space-y-4">
            {(Object.keys({ openai: "", anthropic: "", google: "" }) as ModelId[]).map((id) => (
              <ProviderSection
                key={id}
                id={id}
                isEnabled={enabled.has(id)}
                isLoading={loadingModels[id]}
                error={modelErrors[id]}
                models={availableModels[id]}
                selectedModel={draft.selectedModels[id]}
                onToggle={toggle}
                onModelChange={handleModelChange}
                onFetchModels={fetchModels}
              />
            ))}
          </div>

          <div className="mt-4 text-xs text-neutral-600">
            If you disable all models, runs will be blocked. Select a specific model for each enabled provider.
          </div>

          <div className="mt-6">
            <AgentConfigSection
              settings={draft}
              onAgentToggle={handleAgentToggle}
              onConfidenceToggle={handleConfidenceToggle}
            />
          </div>
        </div>

        <div className="border-t border-neutral-100 p-4 flex justify-end gap-2">
          <button className="btn" type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

