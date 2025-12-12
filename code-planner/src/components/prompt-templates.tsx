"use client";

import { useState, useEffect } from "react";
import type { PromptTemplate } from "@/lib/prompt-templates";
import { getTemplates, saveTemplate, updateTemplate, deleteTemplate } from "@/lib/prompt-templates";

type Props = {
  selectedTemplate: PromptTemplate | null;
  onSelect: (template: PromptTemplate | null) => void;
};

export function PromptTemplates({ selectedTemplate, onSelect }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [form, setForm] = useState({ name: "", description: "", systemPrompt: "", userPrompt: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  const handleSave = () => {
    if (!form.name || !form.systemPrompt || !form.userPrompt) return;
    if (editing) {
      updateTemplate(editing.id, form);
      setEditing(null);
    } else {
      const created = saveTemplate(form);
      onSelect(created);
    }
    setTemplates(getTemplates());
    setForm({ name: "", description: "", systemPrompt: "", userPrompt: "" });
    setShowForm(false);
  };

  const handleEdit = (t: PromptTemplate) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description, systemPrompt: t.systemPrompt, userPrompt: t.userPrompt });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates(getTemplates());
    if (selectedTemplate?.id === id) onSelect(null);
  };

  return (
    <section className="mt-8 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Templates</h2>
          <p className="text-sm text-neutral-600">Create reusable review prompts.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ name: "", description: "", systemPrompt: "", userPrompt: "" });
            setShowForm(true);
          }}
          className="btn"
        >
          New template
        </button>
      </div>

      {showForm ? (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{editing ? "Edit template" : "New template"}</h3>
          </div>

          <div className="grid gap-3 p-5">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
            <input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input"
            />
            <textarea
              placeholder="System prompt (role/instructions)"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className="input min-h-28"
            />
            <textarea
              placeholder="User prompt (will receive file contents and context)"
              value={form.userPrompt}
              onChange={(e) => setForm({ ...form, userPrompt: e.target.value })}
              className="input min-h-28"
            />

            <div className="flex items-center gap-2">
              <button onClick={handleSave} className="btn btn-primary">
                {editing ? "Update" : "Create"}
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                  setForm({ name: "", description: "", systemPrompt: "", userPrompt: "" });
                }}
                className="btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        {templates.map((t) => {
          const active = selectedTemplate?.id === t.id;
          return (
            <div
              key={t.id}
              className={
                active
                  ? "rounded-2xl border border-neutral-900 bg-white p-4"
                  : "rounded-2xl border border-neutral-200 bg-white p-4"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-neutral-900">{t.name}</div>
                  {t.description ? (
                    <div className="mt-1 text-sm text-neutral-600">{t.description}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onSelect(t)} className={active ? "btn btn-primary" : "btn"}>
                    Use
                  </button>
                  <button onClick={() => handleEdit(t)} className="btn">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="btn btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
