export type ModelId = "openai" | "anthropic" | "google";

export type ModelSelection = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

export type Settings = {
  models: ModelId[];
  selectedModels: ModelSelection;
};

const SETTINGS_KEY = "code-planner-settings";

const DEFAULT_SETTINGS: Settings = {
  models: ["openai", "anthropic", "google"],
  selectedModels: {
    openai: null,
    anthropic: null,
    google: null,
  },
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
          openai: parsed.selectedModels.openai ?? null,
          anthropic: parsed.selectedModels.anthropic ?? null,
          google: parsed.selectedModels.google ?? null,
        }
      : DEFAULT_SETTINGS.selectedModels;

    return {
      models: models.length ? models : DEFAULT_SETTINGS.models,
      selectedModels,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
