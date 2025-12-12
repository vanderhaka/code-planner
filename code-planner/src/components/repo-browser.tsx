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
}: {
  repo: string | null;
  onFilesFetched: (files: Array<{ path: string; content: string }>) => void;
}) {
  const { status } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<FileContent[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
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

  const handleFileToggle = (path: string) => {
    setSelectedFiles((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const fetchSelectedFiles = async () => {
    if (!repo || !selectedBranch || selectedFiles.length === 0) return;
    const [owner, repoName] = repo.split("/");
    const results: FileContent[] = [];
    setLoadingFiles(true);

    try {
      for (const path of selectedFiles) {
        const encodedPath = path
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");

        const res = await fetch(
          `/api/github/repos/${owner}/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(selectedBranch)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as FileContent;
          results.push(data);
        }
      }

      setFileContents(results);
      const formatted = results.map((f) => ({
        path: f.path,
        content: f.encoding === "base64" ? atob(f.content ?? "") : f.content ?? "",
      }));
      onFilesFetched(formatted);
    } finally {
      setLoadingFiles(false);
    }
  };

  const blobs = tree.filter((item) => item.type === "blob").slice(0, 200);

  const handleSelectAll = () => {
    if (selectedFiles.length === blobs.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(blobs.map((b) => b.path));
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
          <p className="card-subtitle">Select branch and files to review.</p>
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

      {selectedBranch && !loadingTree && blobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="card-title">Files</h2>
                <p className="card-subtitle">Showing up to 200 files from the tree.</p>
              </div>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-neutral-600 hover:text-neutral-900"
              >
                {selectedFiles.length === blobs.length ? "Deselect all" : "Select all"}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-3">
            {blobs.map((item) => (
              <label
                key={item.path}
                className="flex items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(item.path)}
                  onChange={() => handleFileToggle(item.path)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span className="font-mono text-[12px] text-neutral-800">{item.path}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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

      {selectedFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-neutral-600">
            Selected: <span className="font-medium text-neutral-900">{selectedFiles.length}</span>
          </div>
          <button
            onClick={fetchSelectedFiles}
            disabled={loadingFiles}
            className="btn btn-primary disabled:opacity-50"
          >
            {loadingFiles ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fetching…
              </span>
            ) : (
              "Fetch files"
            )}
          </button>
        </div>
      )}

      {fileContents.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Preview</h2>
          </div>
          <pre className="max-h-96 overflow-auto p-3 text-xs">
            {fileContents.map((f) => {
              const decoded = f.encoding === "base64" ? atob(f.content ?? "") : f.content ?? "";
              return `// ${f.path}\n${decoded}\n\n`;
            }).join("")}
          </pre>
        </div>
      )}
    </section>
  );
}
