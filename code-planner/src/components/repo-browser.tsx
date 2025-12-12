"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type Branch = {
  name: string;
  commit: { sha: string };
};

export function RepoBrowser({
  repo,
  branch,
  onBranchChange,
}: {
  repo: string | null;
  branch: string;
  onBranchChange: (branch: string) => void;
}) {
  const { status } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBranches([]);
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
        const next = data.find((b) => b.name === "main")?.name ?? data[0]?.name ?? "";
        if (next && next !== branch) onBranchChange(next);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load branches");
      } finally {
        setLoadingBranches(false);
      }
    })();

    return () => controller.abort();
  }, [repo, status, branch, onBranchChange]);

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
          <p className="card-subtitle">Choose a branch. Files will be auto-selected when you click Run.</p>
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
                value={branch}
                onChange={(e) => {
                  onBranchChange(e.target.value);
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
    </section>
  );
}
