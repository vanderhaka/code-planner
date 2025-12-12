"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

type Repo = {
  id: number;
  full_name: string;
  private: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (repo: string) => void;
};

export function NewChatModal({ open, onClose, onCreate }: Props) {
  const { status } = useSession();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!open || status !== "authenticated") return;

    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch("/api/github/repos", { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as Repo[];
          setRepos(data);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, status]);

  useEffect(() => {
    if (!open) {
      setSelected("");
    }
  }, [open]);

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

  const handleCreate = () => {
    if (!selected) return;
    onCreate(selected);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-modal-title"
    >
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="card-title" id="new-chat-modal-title">New Chat</div>
              <div className="card-subtitle">Select a repository to review.</div>
            </div>
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        <div className="p-5">
          {status !== "authenticated" ? (
            <div className="text-sm text-neutral-600">Connect GitHub first to create a chat.</div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading repositories…
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="repo-select" className="mb-1 block text-sm font-medium text-neutral-700">
                  Repository
                </label>
                <select
                  id="repo-select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="input"
                >
                  <option value="">Select a repository</option>
                  {repos.map((r) => (
                    <option key={r.id} value={r.full_name}>
                      {r.full_name} {r.private ? "(private)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={!selected}
                onClick={handleCreate}
                className="btn btn-primary disabled:opacity-50"
              >
                Create chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
