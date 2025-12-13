/**
 * Memoized provider section component for settings modal.
 */

import { memo } from "react";
import type { ModelId } from "@/lib/settings";
import { sanitizeModelName } from "@/lib/sanitizer";

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
  id: ModelId;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  models: ModelOption[];
  selectedModel: string | null;
  onToggle: (id: ModelId) => void;
  onModelChange: (provider: ModelId, modelId: string) => void;
  onFetchModels: (provider: ModelId) => void;
};

export const ProviderSection = memo(function ProviderSection({
  id,
  isEnabled,
  isLoading,
  error,
  models,
  selectedModel,
  onToggle,
  onModelChange,
  onFetchModels,
}: Props) {
  const handleToggle = () => {
    onToggle(id);
    // Fetch models if enabling and not already loaded
    if (!isEnabled && models.length === 0 && !isLoading) {
      onFetchModels(id);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <label className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-neutral-900">{MODEL_LABEL[id]}</div>
          <div className="text-xs text-neutral-600">Enable/disable for runs</div>
        </div>
        <input
          className="h-4 w-4 accent-neutral-900"
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
        />
      </label>

      {isEnabled && (
        <div className="mt-3 pt-3 border-t border-neutral-100 model-selector">
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
              onChange={(e) => onModelChange(id, e.target.value)}
              className="input text-xs"
              disabled={isLoading}
            >
              <option value="">Select a model</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {sanitizeModelName(model.name)}
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
});

