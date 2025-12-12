export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
};

const STORAGE_KEY = "prompt-templates";

export function getTemplates(): PromptTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveTemplate(template: Omit<PromptTemplate, "id">): PromptTemplate {
  const templates = getTemplates();
  const newTemplate = { ...template, id: crypto.randomUUID() };
  const updated = [...templates, newTemplate];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newTemplate;
}

export function updateTemplate(id: string, updates: Partial<Omit<PromptTemplate, "id">>): void {
  const templates = getTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return;
  templates[idx] = { ...templates[idx], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function deleteTemplate(id: string): void {
  const templates = getTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
