"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthButtons } from "@/components/auth-buttons";
import { RepoBrowser } from "@/components/repo-browser";
import { SettingsModal } from "@/components/settings-modal";
import { Sidebar } from "@/components/sidebar";
import { NewChatModal } from "@/components/new-chat-modal";
import { TemplateModal } from "@/components/template-modal";
import { createChat, deleteChat, getActiveChatId, listChats, setActiveChatId } from "@/lib/chats";
import { getSettings, saveSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings";
import { getTemplates, deleteTemplate } from "@/lib/prompt-templates";
import type { PromptTemplate } from "@/lib/prompt-templates";

type RunResult = { model: string; output: string };
type RunResponse = { results: RunResult[]; consolidated: string };

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [userMessage, setUserMessage] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RunResponse | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(() => ({
    models: ["openai", "anthropic", "google"],
    selectedModels: {
      openai: null,
      anthropic: null,
      google: null,
    },
  }));

  const [chats, setChats] = useState(() => [] as ReturnType<typeof listChats>);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<RunResult | null>(null);

  useEffect(() => {
    setMounted(true);

    const existing = listChats();
    let active = getActiveChatId();

    if (existing.length === 0) {
      setNewChatOpen(true);
      return;
    }

    if (!active || !existing.some((c) => c.id === active)) {
      active = existing[0].id;
      setActiveChatId(active);
    }

    setChats(existing);
    setActiveChatIdState(active);
    setSettingsState(getSettings());
    setTemplates(getTemplates());
  }, []);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? null, [chats, activeChatId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === selectedTemplateId) ?? null, [templates, selectedTemplateId]);

  const resetRunState = () => {
    setFiles([]);
    setUserMessage("");
    setRunning(false);
    setError(null);
    setResults(null);
  };

  const handleCreateChat = (repo: string) => {
    const repoName = repo.split("/")[1] ?? repo;
    const created = createChat(repoName, repo);
    setChats(listChats());
    setActiveChatIdState(created.id);
    setNewChatOpen(false);
    resetRunState();
  };

  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    setActiveChatIdState(id);
    resetRunState();
  };

  const handleDeleteChat = (id: string) => {
    deleteChat(id);
    const updated = listChats();
    setChats(updated);

    if (activeChatId === id) {
      const next = updated[0]?.id ?? null;
      if (next) {
        setActiveChatId(next);
      }
      setActiveChatIdState(next);
      resetRunState();
    }
  };

  const handleSaveSettings = (next: typeof settings) => {
    setSettingsState(next);
    saveSettings(next);
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
  };

  const refreshTemplates = () => {
    setTemplates(getTemplates());
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setNewTemplateOpen(true);
  };

  const handleEditTemplate = (id: string) => {
    const t = templates.find((t) => t.id === id);
    if (t) {
      setEditingTemplate(t);
      setNewTemplateOpen(true);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
    refreshTemplates();
    if (selectedTemplateId === id) {
      setSelectedTemplateId(null);
    }
  };

  const handleRun = async () => {
    if (!selectedTemplate || files.length === 0) return;
    if (!settings.models.length) {
      setError("Enable at least one model in Settings.");
      return;
    }

    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: {
            systemPrompt: selectedTemplate.systemPrompt,
            userPrompt: selectedTemplate.userPrompt,
          },
              userMessage,
          files,
          models: settings.models,
          selectedModels: settings.selectedModels,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt);
        return;
      }
      const data = await res.json();
      setResults(data as RunResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    !mounted ? null :
    <div className="flex">
      <button
        type="button"
        className="fixed left-4 top-4 z-40 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm lg:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-80 transform transition-transform lg:relative lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onNewChat={() => { setNewChatOpen(true); setSidebarOpen(false); }}
          onSelectChat={(id) => { handleSelectChat(id); setSidebarOpen(false); }}
          onDeleteChat={handleDeleteChat}
          onSelectTemplate={(id) => { handleSelectTemplate(id); setSidebarOpen(false); }}
          onEditTemplate={handleEditTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onNewTemplate={handleNewTemplate}
          onOpenSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
        />
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                {activeChat ? activeChat.title : "No chat"}
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Code Planner</h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600">
                {activeChat?.repo
                  ? `Reviewing ${activeChat.repo}`
                  : "Create a new chat to select a repository."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AuthButtons />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-8">
              <div className="card">
                <div className="card-header">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="card-title">Run</h2>
                      <p className="card-subtitle">
                        Models: <span className="font-medium text-neutral-900">{settings.models.join(", ")}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button type="button" className="btn" onClick={handleNewTemplate}>
                        New template
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label htmlFor="run-template-select" className="mb-1 block text-xs font-medium text-neutral-700">
                      Template
                    </label>
                    <select
                      id="run-template-select"
                      className="input text-xs"
                      value={selectedTemplateId ?? ""}
                      onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                      disabled={templates.length === 0}
                    >
                      <option value="">{templates.length === 0 ? "No templates yet" : "Select a template"}</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    {!selectedTemplate ? (
                      <div className="mt-2 text-xs text-neutral-600">
                        Pick a template to enable running reviews.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="p-5">
                  <button
                    onClick={handleRun}
                    disabled={!selectedTemplate || running || files.length === 0 || settings.models.length === 0}
                    className="btn btn-primary disabled:opacity-50"
                    title={
                      !selectedTemplate
                        ? "Select a template first"
                        : files.length === 0
                          ? "Select and fetch files first"
                          : settings.models.length === 0
                            ? "Enable at least one model in Settings"
                            : undefined
                    }
                  >
                    {running
                      ? "Running…"
                      : selectedTemplate
                        ? `Run "${selectedTemplate.name}"`
                        : "Run"}
                  </button>
                  <div className="mt-2 text-sm text-neutral-600">
                    Files loaded: <span className="font-medium text-neutral-900">{files.length}</span>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              {results ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Outputs</h2>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {results.results.map((r) => (
                      <button
                        key={r.model}
                        type="button"
                        onClick={() => setSelectedOutput(r)}
                        className="card hover:border-neutral-400 transition-colors text-left"
                      >
                        <div className="card-header">
                          <h3 className="card-title capitalize">{r.model}</h3>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="card-title">Consolidated plan</h3>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(results.consolidated);
                          }}
                          className="btn text-xs"
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="card-subtitle">Generated by OpenAI ({settings.selectedModels.openai || "gpt-4o-mini"})</p>
                    </div>
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap text-sm text-neutral-800">{results.consolidated}</pre>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-8">
              <RepoBrowser
                repo={activeChat?.repo ?? null}
                onFilesFetched={setFiles}
                userMessage={userMessage}
                onUserMessageChange={setUserMessage}
              />
            </div>
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreate={handleCreateChat}
      />

      <TemplateModal
        open={newTemplateOpen}
        editingTemplate={editingTemplate}
        onClose={() => { setNewTemplateOpen(false); setEditingTemplate(null); }}
        onSaved={(id) => {
          refreshTemplates();
          setSelectedTemplateId(id);
        }}
      />

      {selectedOutput && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setSelectedOutput(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="output-modal-title"
        >
          <div className="card w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="card-title capitalize" id="output-modal-title">{selectedOutput.model}</h2>
                  <p className="card-subtitle">Model output</p>
                </div>
                <button className="btn" type="button" onClick={() => setSelectedOutput(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-sm text-neutral-800">{selectedOutput.output}</pre>
            </div>
            <div className="p-5 border-t border-neutral-200">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(selectedOutput.output);
                }}
                className="btn text-xs"
                title="Copy to clipboard"
              >
                Copy output
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
