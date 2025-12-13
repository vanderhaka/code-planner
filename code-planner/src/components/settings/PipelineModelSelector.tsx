/**
 * Pipeline model selector component for prompt improver and consolidator stages.
 */

import type { ModelId, Settings } from "@/lib/settings";
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
  stage: "promptImprover" | "consolidator";
  label: string;
  settings: Settings;
  availableModels: Record<ModelId, ModelOption[]>;
  loadingModels: Record<ModelId, boolean>;
  onProviderChange: (stage: "promptImprover" | "consolidator", provider: ModelId) => void;
  onModelChange: (stage: "promptImprover" | "consolidator", modelId: string) => void;
};

export function PipelineModelSelector({
  stage,
  label,
  settings,
  availableModels,
  loadingModels,
  onProviderChange,
  onModelChange,
}: Props) {
  const provider = settings.pipeline[stage].provider;
  const modelId = settings.pipeline[stage].modelId;
  const models = availableModels[provider];
  const isLoading = loadingModels[provider];

  return (
    <div>
      <div className="text-xs font-medium text-neutral-700">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          className="input text-xs"
          value={provider}
          onChange={(e) => onProviderChange(stage, e.target.value as ModelId)}
        >
          {(Object.keys(MODEL_LABEL) as ModelId[]).map((id) => (
            <option key={id} value={id}>
              {MODEL_LABEL[id]}
            </option>
          ))}
        </select>
        <select
          className="input text-xs"
          value={modelId ?? ""}
          onChange={(e) => onModelChange(stage, e.target.value)}
          disabled={isLoading || models.length === 0}
        >
          <option value="">Default</option>
          {isLoading ? (
            <option disabled>Loading...</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {sanitizeModelName(m.name)}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}

