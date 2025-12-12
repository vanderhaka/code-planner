"use client";

import { useEffect, useState, useCallback } from "react";
import { saveTemplate, updateTemplate } from "@/lib/prompt-templates";
import type { PromptTemplate } from "@/lib/prompt-templates";

type Props = {
  open: boolean;
  editingTemplate?: PromptTemplate | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function TemplateModal({ open, editingTemplate, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    userPrompt: "",
  });

  useEffect(() => {
    if (!open) return;
    if (editingTemplate) {
      setForm({
        name: editingTemplate.name,
        description: editingTemplate.description ?? "",
        systemPrompt: editingTemplate.systemPrompt,
        userPrompt: editingTemplate.userPrompt,
      });
    } else {
      setForm({ name: "", description: "", systemPrompt: "", userPrompt: "" });
    }
  }, [open, editingTemplate]);

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

  if (!open) return null;

  const canSave = Boolean(form.name && form.systemPrompt && form.userPrompt);
  const isEditing = Boolean(editingTemplate);

  const handleSave = () => {
    if (!canSave) return;
    if (editingTemplate) {
      updateTemplate(editingTemplate.id, form);
      onSaved(editingTemplate.id);
    } else {
      const created = saveTemplate(form);
      onSaved(created.id);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
    >
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="card-title" id="template-modal-title">
                {isEditing ? "Edit template" : "New template"}
              </div>
              <div className="card-subtitle">Saved locally in your browser.</div>
            </div>
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-5">
          <div>
            <label htmlFor="template-name" className="mb-1 block text-sm font-medium text-neutral-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="template-name"
              className="input"
              placeholder="e.g. Code Review"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="template-description" className="mb-1 block text-sm font-medium text-neutral-700">
              Description
            </label>
            <input
              id="template-description"
              className="input"
              placeholder="Optional short description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="template-system" className="mb-1 block text-sm font-medium text-neutral-700">
              System prompt <span className="text-red-500">*</span>
            </label>
            <textarea
              id="template-system"
              className="input min-h-28"
              placeholder="Instructions for the AI model"
              value={form.systemPrompt}
              onChange={(e) => setForm((p) => ({ ...p, systemPrompt: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="template-user" className="mb-1 block text-sm font-medium text-neutral-700">
              User prompt <span className="text-red-500">*</span>
            </label>
            <textarea
              id="template-user"
              className="input min-h-32"
              placeholder="The request to send (files will be appended)"
              value={form.userPrompt}
              onChange={(e) => setForm((p) => ({ ...p, userPrompt: e.target.value }))}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary disabled:opacity-50"
              type="button"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isEditing ? "Save changes" : "Create template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
