"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type Repo = {
  id: number;
  full_name: string;
  private: boolean;
  html_url: string;
};

export function RepoList() {
  const { status } = useSession();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    void (async () => {
      setError(null);
      const res = await fetch("/api/github/repos", {
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        setError(body);
        return;
      }

      const data = (await res.json()) as Repo[];
      setRepos(data);
    })();

    return () => controller.abort();
  }, [status]);

  if (status !== "authenticated") return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Repos</h2>

      {error ? <pre className="mt-2 text-sm">{error}</pre> : null}

      {!repos && !error ? <div className="mt-2 text-sm">Loading…</div> : null}

      {repos ? (
        <ul className="mt-2 space-y-1 text-sm">
          {repos.slice(0, 20).map((repo) => (
            <li key={repo.id}>
              <a
                className="underline"
                href={repo.html_url}
                target="_blank"
                rel="noreferrer"
              >
                {repo.full_name}
              </a>{" "}
              {repo.private ? "(private)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
