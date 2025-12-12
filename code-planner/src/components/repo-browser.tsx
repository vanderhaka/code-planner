"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type Branch = {
  name: string;
  commit: { sha: string };
};

type TreeItem = {
  path: string;
  type: "blob" | "tree";
  sha: string;
};

type FileContent = {
  name: string;
  path: string;
  content?: string;
  encoding?: string;
};

export function RepoBrowser({
  repo,
  onFilesFetched,
  userMessage,
  onUserMessageChange,
}: {
  repo: string | null;
  onFilesFetched: (files: Array<{ path: string; content: string }>) => void;
  userMessage: string;
  onUserMessageChange: (msg: string) => void;
}) {
  const { status } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [fileContents, setFileContents] = useState<FileContent[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFiles([]);
    setFileContents([]);
    setBranches([]);
    setTree([]);
    setSelectedBranch("main");
    setError(null);
  }, [repo]);

  useEffect(() => {
    if (!repo || status !== "authenticated") return;
    const [owner, repoName] = repo.split("/");
    const controller = new AbortController();
    setLoadingBranches(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/github/repos/${owner}/${repoName}/branches`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setError(`Failed to load branches (${res.status})`);
          return;
        }
        const data = (await res.json()) as Branch[];
        setBranches(data);
        setSelectedBranch(data.find((b) => b.name === "main")?.name ?? data[0]?.name ?? "");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load branches");
      } finally {
        setLoadingBranches(false);
      }
    })();

    return () => controller.abort();
  }, [repo, status]);

  useEffect(() => {
    // Wait for branches to load before fetching tree
    if (!repo || !selectedBranch || status !== "authenticated" || branches.length === 0) return;
    const [owner, repoName] = repo.split("/");
    const controller = new AbortController();
    setLoadingTree(true);

    void (async () => {
      try {
        const res = await fetch(
          `/api/github/repos/${owner}/${repoName}/tree?sha=${encodeURIComponent(selectedBranch)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setError(`Failed to load files (${res.status})`);
          return;
        }
        const data = (await res.json()) as { tree: TreeItem[] };
        setTree(data.tree ?? []);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load file tree");
      } finally {
        setLoadingTree(false);
      }
    })();

    return () => controller.abort();
  }, [repo, selectedBranch, status, branches.length]);

  const decodeContent = (f: FileContent) =>
    f.encoding === "base64" ? atob(f.content ?? "") : f.content ?? "";

  const stopwords = new Set([
    "the","and","for","with","from","into","that","this","these","those","then","than",
    "your","you","our","are","was","were","will","would","should","could","can","cant",
    "app","code","repo","project","file","files","please","make","add","remove","update",
    "able","using","use","used","run","runs",
  ]);

  const extractKeywords = (text: string) => {
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => t.length >= 3)
      .filter((t) => !stopwords.has(t));
    return Array.from(new Set(tokens)).slice(0, 12);
  };

  const scorePath = (path: string, keywords: string[]) => {
    const p = path.toLowerCase();
    const filename = p.split("/").pop() ?? p;
    let score = 0;
    for (const k of keywords) {
      if (filename.includes(k)) score += 8;
      else if (p.includes(k)) score += 4;
    }
    // Heuristics for common intents
    if (keywords.some((k) => ["ui","react","component","modal","page"].includes(k)) && (p.endsWith(".tsx") || p.endsWith(".jsx"))) score += 2;
    if (keywords.some((k) => ["api","route","endpoint","server"].includes(k)) && p.includes("/api/")) score += 2;
    if (keywords.some((k) => ["auth","login","oauth","nextauth"].includes(k)) && p.includes("auth")) score += 2;
    if (p.includes("node_modules/")) score -= 100;
    if (p.includes(".next/")) score -= 100;
    if (p.endsWith(".lock")) score -= 5;
    return score;
  };

  const fetchSelectedFiles = async (paths: string[]) => {
    if (!repo || !selectedBranch || paths.length === 0) return;
    const [owner, repoName] = repo.split("/");
    const results: FileContent[] = [];
    setLoadingFiles(true);

    try {
      // Cap: avoid huge prompt + rate limits
      const MAX_FILES = 12;
      const MAX_TOTAL_CHARS = 220_000;
      let totalChars = 0;

      const capped = paths.slice(0, MAX_FILES);
      for (const path of capped) {
        const encodedPath = path
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");

        const res = await fetch(
          `/api/github/repos/${owner}/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(selectedBranch)}`,
        );
        if (!res.ok) continue;
        const data = (await res.json()) as FileContent;
        const decoded = decodeContent(data);
        if (!decoded) continue;

        // Hard cap by chars to keep the prompt safe
        if (totalChars + decoded.length > MAX_TOTAL_CHARS) continue;
        totalChars += decoded.length;
        results.push(data);
      }

      setFileContents(results);
      const formatted = results.map((f) => ({
        path: f.path,
        content: decodeContent(f),
      }));
      onFilesFetched(formatted);
    } finally {
      setLoadingFiles(false);
    }
  };

  const allBlobs = tree.filter((item) => item.type === "blob");

  const handleSearch = async () => {
    if (!repo || !selectedBranch) return;
    const msg = userMessage.trim();
    if (!msg) {
      setError("Describe what you want to do (goal) before searching.");
      return;
    }
    if (loadingTree) return;
    setError(null);
    setSearching(true);
    try {
      const keywords = extractKeywords(msg);
      if (keywords.length === 0) {
        setError("Please include a few specific keywords (e.g., \"settings modal model dropdown\").");
        return;
      }

      // Score all repo blobs (tree is already recursive)
      const ranked = allBlobs
        .map((b) => ({ path: b.path, score: scorePath(b.path, keywords) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((r) => r.path);

      if (ranked.length === 0) {
        setSelectedFiles([]);
        setFileContents([]);
        onFilesFetched([]);
        setError("No matches found. Try more specific keywords (feature name, component name, route path).");
        return;
      }

      setSelectedFiles(ranked);
      await fetchSelectedFiles(ranked);
    } finally {
      setSearching(false);
    }
  };

  if (status !== "authenticated") return null;

  if (!repo) {
    return (
      <section className="space-y-6">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Files</h2>
            <p className="card-subtitle">Create a new chat to select a repository.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{repo}</h2>
          <p className="card-subtitle">Search the repo for relevant files, then run your template.</p>
        </div>
        <div className="p-5">
          {loadingBranches ? (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading branches…
            </div>
          ) : (
            <div>
              <label htmlFor="branch-select" className="mb-1 block text-sm font-medium text-neutral-700">
                Branch
              </label>
              <select
                id="branch-select"
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setSelectedFiles([]);
                  setFileContents([]);
                  onFilesFetched([]);
                }}
                className="input"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Search repo</h2>
          <p className="card-subtitle">Describe your goal. We’ll auto-load the most relevant files.</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label htmlFor="repo-goal" className="mb-1 block text-sm font-medium text-neutral-700">
              What do you want to do?
            </label>
            <textarea
              id="repo-goal"
              value={userMessage}
              onChange={(e) => onUserMessageChange(e.target.value)}
              className="input min-h-24"
              placeholder='e.g. "Add template picker to the Run card, and persist selection per chat"'
            />
            <div className="mt-1 text-xs text-neutral-500">
              This message will be appended to the template’s user prompt for every model run.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            onClick={handleSearch}
            disabled={loadingTree || loadingFiles || searching || !userMessage.trim()}
            title={!userMessage.trim() ? "Describe your goal first" : undefined}
          >
            {searching ? "Searching…" : loadingFiles ? "Loading files…" : "Search & load files"}
          </button>

          {selectedFiles.length > 0 ? (
            <div className="text-sm text-neutral-700">
              Selected (top matches): <span className="font-medium text-neutral-900">{selectedFiles.length}</span>
            </div>
          ) : null}
        </div>
      </div>

      {loadingTree && (
        <div className="card">
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-neutral-600">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading files…
          </div>
        </div>
      )}

      {fileContents.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Preview</h2>
          </div>
          <pre className="max-h-96 overflow-auto p-3 text-xs">
            {fileContents.map((f) => {
              const decoded = decodeContent(f);
              return `// ${f.path}\n${decoded}\n\n`;
            }).join("")}
          </pre>
        </div>
      )}
    </section>
  );
}
