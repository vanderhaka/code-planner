"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AuthButtons } from "@/components/auth-buttons";
import { Sidebar } from "@/components/sidebar";
import { NewChatModal } from "@/components/new-chat-modal";
import { createChat, deleteChat, getActiveChatId, listChats, setActiveChatId } from "@/lib/chats";
import { getSettings, saveSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings";
import { getTemplates } from "@/lib/prompt-templates";
import type { PromptTemplate } from "@/lib/prompt-templates";

type Branch = {
  name: string;
  commit: { sha: string };
};

type RunResult = { model: string; output: string };
type RunResponse = {
  results: RunResult[];
  consolidated: string;
  meta?: {
    repo: string;
    branch: string;
    selectedFiles: string[];
    promptImprover: { provider: string; modelId: string | null };
    consolidator: { provider: string; modelId: string | null };
  };
};

type AgentResult = {
  agent: string;
  output: string;
  provider: string;
  modelId: string | null;
};

type AgentRunResponse = {
  results: AgentResult[];
  synthesized: string;
  meta?: {
    repo: string;
    branch: string;
    scope: { type: string; value: string; commitCount?: number };
    scopeDescription: string;
    selectedFiles: string[];
    agents: string[];
  };
  confidence?: {
    score: number;
    breakdown: {
      understanding: number;
      solution: number;
      sideEffects: number;
    };
    recommendation: "proceed" | "ask" | "stop";
  };
};

export default function Home() {
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [userMessage, setUserMessage] = useState<string>("");
  const [scope, setScope] = useState<string>("");
  const [branch, setBranch] = useState<string>("main");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RunResponse | null>(null);
  const [agentResults, setAgentResults] = useState<AgentRunResponse | null>(null);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(() => getSettings());

  const [chats, setChats] = useState(() => [] as ReturnType<typeof listChats>);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<RunResult | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);

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
    const loadedTemplates = getTemplates();
    setTemplates(loadedTemplates);

    // Handle template query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const templateParam = urlParams.get("template");
    if (templateParam && loadedTemplates.some((t) => t.id === templateParam)) {
      setSelectedTemplateId(templateParam);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Refresh settings when returning from settings page
  useEffect(() => {
    const handleFocus = () => {
      setSettingsState(getSettings());
      setTemplates(getTemplates());
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? null, [chats, activeChatId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === selectedTemplateId) ?? null, [templates, selectedTemplateId]);

  // Branch fetching logic
  useEffect(() => {
    setBranches([]);
    setBranchError(null);
  }, [activeChat?.repo]);

  useEffect(() => {
    if (!activeChat?.repo || status !== "authenticated") return;
    const [owner, repoName] = activeChat.repo.split("/");
    const controller = new AbortController();
    setLoadingBranches(true);
    setBranchError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/github/repos/${owner}/${repoName}/branches`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setBranchError(`Failed to load branches (${res.status})`);
          return;
        }
        const data = (await res.json()) as Branch[];
        setBranches(data);
        // Set default branch (prefer "main", fallback to first branch)
        const defaultBranch = data.find((b) => b.name === "main")?.name ?? data[0]?.name ?? "main";
        setBranch(defaultBranch);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setBranchError("Failed to load branches");
      } finally {
        setLoadingBranches(false);
      }
    })();

    return () => controller.abort();
  }, [activeChat?.repo, status]); // Removed 'branch' - this effect sets branch, not reads it

  const resetRunState = () => {
    setUserMessage("");
    setScope("");
    setRunning(false);
    setError(null);
    setResults(null);
    setAgentResults(null);
    setPipelineProgress(null);
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

  const handleRun = async () => {
    if (!selectedTemplate || !activeChat?.repo) return;
    if (!userMessage.trim()) {
      setError("Tell the models what you want to do before running.");
      return;
    }
    if (!settings.models.length) {
      setError("Enable at least one model in Settings.");
      return;
    }

    setRunning(true);
    setError(null);
    setResults(null);
    setAgentResults(null);

    try {
      // Use agent-based mode if enabled
      if (settings.reviewMode === "agent-based") {
        const res = await fetch("/api/pipeline/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: activeChat.repo,
            branch,
            template: {
              systemPrompt: selectedTemplate.systemPrompt,
            },
            userMessage,
            scope: scope.trim() || null,
            models: settings.models,
            selectedModels: settings.selectedModels,
            agentConfig: settings.agentConfig,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(txt);
          return;
        }
        const data = await res.json();
        setAgentResults(data as AgentRunResponse);
      } else {
        // Standard mode - uses SSE streaming
        const res = await fetch("/api/pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: activeChat.repo,
            branch,
            template: {
              systemPrompt: selectedTemplate.systemPrompt,
            },
            userMessage,
            models: settings.models,
            selectedModels: settings.selectedModels,
            pipeline: settings.pipeline,
          }),
        });
        
        if (!res.ok) {
          const txt = await res.text();
          setError(txt);
          return;
        }

        // Consume SSE stream
        const reader = res.body?.getReader();
        if (!reader) {
          setError("Failed to read response stream");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "progress") {
                setPipelineProgress(data.data.message);
              } else if (data.type === "result") {
                setResults(data.data as RunResponse);
                setPipelineProgress(null);
              } else if (data.type === "error") {
                setError(data.error);
                setPipelineProgress(null);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
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
          onNewChat={() => { setNewChatOpen(true); setSidebarOpen(false); }}
          onSelectChat={(id) => { handleSelectChat(id); setSidebarOpen(false); }}
          onDeleteChat={handleDeleteChat}
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

          <div className="space-y-8">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Run</h2>
                  <p className="card-subtitle">
                    Models: <span className="font-medium text-neutral-900">{settings.models.join(", ")}</span>
                  </p>
                </div>

                {status === "authenticated" && activeChat?.repo && (
                  <div className="mt-3">
                    <label htmlFor="run-branch-select" className="mb-1 block text-xs font-medium text-neutral-700">
                      Branch
                    </label>
                    {loadingBranches ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading branches…
                      </div>
                    ) : branches.length > 0 ? (
                      <select
                        id="run-branch-select"
                        className="input text-xs"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      >
                        {branches.map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {branchError && (
                      <div className="mt-2 text-xs text-red-600">
                        {branchError}
                      </div>
                    )}
                  </div>
                )}

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

                <div className="mt-3">
                  <label htmlFor="review-mode-select" className="mb-1 block text-xs font-medium text-neutral-700">
                    Review Mode
                  </label>
                  <select
                    id="review-mode-select"
                    className="input text-xs"
                    value={settings.reviewMode}
                    onChange={(e) => {
                      setSettingsState({
                        ...settings,
                        reviewMode: e.target.value as "standard" | "agent-based",
                      });
                      saveSettings({
                        ...settings,
                        reviewMode: e.target.value as "standard" | "agent-based",
                      });
                    }}
                  >
                    <option value="standard">Standard</option>
                    <option value="agent-based">Agent-Based</option>
                  </select>
                  <div className="mt-1 text-xs text-neutral-500">
                    {settings.reviewMode === "agent-based"
                      ? "Uses specialized agents for bugs, security, performance, and refactoring"
                      : "Standard multi-model review with consolidation"}
                  </div>
                </div>

                {settings.reviewMode === "agent-based" && (
                  <div className="mt-3">
                    <label htmlFor="scope-input" className="mb-1 block text-xs font-medium text-neutral-700">
                      Scope (optional)
                    </label>
                    <input
                      id="scope-input"
                      type="text"
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      className="input text-xs"
                      placeholder='e.g. "src/components/Button.tsx", "src/**/*.ts", "5" (commits), or leave empty'
                    />
                    <div className="mt-1 text-xs text-neutral-500">
                      File path, glob pattern, commit count, or empty for last commit
                    </div>
                  </div>
                )}
              </div>

                <div className="p-5">
                  <div className="mb-3">
                    <label htmlFor="run-goal" className="mb-1 block text-xs font-medium text-neutral-700">
                      What do you want to do?
                    </label>
                    <textarea
                      id="run-goal"
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                      className="input min-h-24 text-sm"
                      placeholder='e.g. "Add a copy button for the consolidated plan and show which model generated it."'
                    />
                    <div className="mt-1 text-xs text-neutral-500">
                      This becomes the user message. We’ll refine it, search the repo, then run the models.
                    </div>
                  </div>

                  <button
                    onClick={handleRun}
                    disabled={!selectedTemplate || !activeChat?.repo || running || !userMessage.trim() || settings.models.length === 0}
                    className="btn btn-primary disabled:opacity-50"
                    title={
                      !selectedTemplate
                        ? "Select a template first"
                        : !userMessage.trim()
                          ? "Tell the models what you want to do first"
                          : settings.models.length === 0
                            ? "Enable at least one model in Settings"
                            : undefined
                    }
                  >
                    {running
                      ? (pipelineProgress ?? "Running…")
                      : selectedTemplate
                        ? `Run "${selectedTemplate.name}"`
                        : "Run"}
                  </button>
                  {results?.meta?.selectedFiles?.length ? (
                    <div className="mt-2 text-sm text-neutral-600">
                      Files selected:{" "}
                      <span className="font-medium text-neutral-900">{results.meta.selectedFiles.length}</span>
                    </div>
                  ) : agentResults?.meta?.selectedFiles?.length ? (
                    <div className="mt-2 text-sm text-neutral-600">
                      Files reviewed:{" "}
                      <span className="font-medium text-neutral-900">{agentResults.meta.selectedFiles.length}</span>
                      {agentResults.meta.scopeDescription && (
                        <span className="ml-2 text-xs text-neutral-500">
                          ({agentResults.meta.scopeDescription})
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              {agentResults ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Agent Review Results</h2>
                  </div>

                  {agentResults.confidence && (
                    <div className="card border-2">
                      <div className="card-header">
                        <h3 className="card-title">Confidence Evaluation</h3>
                      </div>
                      <div className="p-5">
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">Overall Confidence</span>
                            <span className="text-lg font-semibold">{agentResults.confidence.score}%</span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                agentResults.confidence.score >= 90
                                  ? "bg-green-500"
                                  : agentResults.confidence.score >= 70
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${agentResults.confidence.score}%` }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div className="text-neutral-600">Understanding</div>
                            <div className="font-medium">{agentResults.confidence.breakdown.understanding}%</div>
                          </div>
                          <div>
                            <div className="text-neutral-600">Solution</div>
                            <div className="font-medium">{agentResults.confidence.breakdown.solution}%</div>
                          </div>
                          <div>
                            <div className="text-neutral-600">Side Effects</div>
                            <div className="font-medium">{agentResults.confidence.breakdown.sideEffects}%</div>
                          </div>
                        </div>
                        <div className="mt-3 text-sm">
                          <span className="font-medium">Recommendation: </span>
                          <span
                            className={
                              agentResults.confidence.recommendation === "proceed"
                                ? "text-green-600"
                                : agentResults.confidence.recommendation === "ask"
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          >
                            {agentResults.confidence.recommendation === "proceed"
                              ? "Proceed with implementation"
                              : agentResults.confidence.recommendation === "ask"
                                ? "Ask user before proceeding"
                                : "Do not proceed - investigate further"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {agentResults.results.map((r) => (
                      <button
                        key={r.agent}
                        type="button"
                        onClick={() => setSelectedOutput({ model: r.agent, output: r.output })}
                        className="card hover:border-neutral-400 transition-colors text-left"
                      >
                        <div className="card-header">
                          <h3 className="card-title capitalize">{r.agent.replace(/-/g, " ")}</h3>
                          <p className="card-subtitle text-xs">
                            {r.provider} ({r.modelId ?? "default"})
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="card-title">Synthesized Review</h3>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(agentResults.synthesized);
                          }}
                          className="btn text-xs"
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="card-subtitle">
                        Combined findings from {agentResults.results.length} specialized agents
                      </p>
                    </div>
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap text-sm text-neutral-800">{agentResults.synthesized}</pre>
                    </div>
                  </div>
                </div>
              ) : results ? (
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
                      <p className="card-subtitle">
                        Generated by {results.meta?.consolidator?.provider ?? settings.pipeline.consolidator.provider} (
                        {results.meta?.consolidator?.modelId ?? settings.pipeline.consolidator.modelId ?? "default"})
                      </p>
                    </div>
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap text-sm text-neutral-800">{results.consolidated}</pre>
                    </div>
                  </div>
                </div>
              ) : null}
          </div>
        </div>
      </div>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreate={handleCreateChat}
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
