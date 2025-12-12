"use client";

import { useState } from "react";
import type { Chat } from "@/lib/chats";
import type { PromptTemplate } from "@/lib/prompt-templates";

type Props = {
  chats: Chat[];
  activeChatId: string | null;
  templates: PromptTemplate[];
  selectedTemplateId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onSelectTemplate: (id: string) => void;
  onEditTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onNewTemplate: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({
  chats,
  activeChatId,
  templates,
  selectedTemplateId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onSelectTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onNewTemplate,
  onOpenSettings,
}: Props) {
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white/80 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight">Code Planner</div>
        <button className="btn" onClick={onNewChat} type="button">
          New chat
        </button>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-neutral-500">Chats</div>
        <div className="mt-2 space-y-1">
          {chats.map((chat) => {
            const active = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                className={
                  active
                    ? "flex items-center justify-between rounded-xl border border-neutral-900 bg-white px-3 py-2"
                    : "flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
                }
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="truncate text-sm font-medium">{chat.title}</div>
                  {chat.repo ? (
                    <div className="truncate text-xs text-neutral-500">{chat.repo}</div>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-danger ml-2 px-2 py-1 text-xs"
                  onClick={() => setChatToDelete(chat.id)}
                  aria-label="Delete chat"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-neutral-500">Templates</div>
          <button className="text-xs text-neutral-600 hover:text-neutral-900" onClick={onNewTemplate} type="button">
            + New
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
              <p className="text-sm text-neutral-600">No templates yet</p>
              <p className="mt-1 text-xs text-neutral-500">
                Templates define how AI models review your code.
              </p>
              <button
                type="button"
                onClick={onNewTemplate}
                className="btn btn-primary mt-3 text-xs"
              >
                Create your first template
              </button>
            </div>
          ) : (
            templates.map((t) => {
              const active = t.id === selectedTemplateId;
              return (
                <div
                  key={t.id}
                  className={
                    active
                      ? "flex items-center justify-between rounded-xl border border-neutral-900 bg-white px-3 py-2"
                      : "flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(t.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    {t.description ? (
                      <div className="truncate text-xs text-neutral-500">{t.description}</div>
                    ) : null}
                  </button>
                  <div className="ml-2 flex gap-1">
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                      onClick={() => onEditTemplate(t.id)}
                      aria-label="Edit template"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => setTemplateToDelete(t.id)}
                      aria-label="Delete template"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <button className="btn w-full" onClick={onOpenSettings} type="button">
          Settings
        </button>
      </div>

      {chatToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-sm" role="dialog" aria-modal="true">
            <div className="p-5">
              <h3 className="text-lg font-semibold">Delete chat?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                This will permanently delete this chat and its history.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setChatToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onDeleteChat(chatToDelete);
                    setChatToDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  onClick={() => {
                    onDeleteTemplate(templateToDelete);
                    setTemplateToDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
