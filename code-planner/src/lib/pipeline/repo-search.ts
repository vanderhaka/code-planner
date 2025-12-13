/**
 * Repository search: fetch tree and rank files by relevance.
 */

import type { TreeItem } from "./types";

/**
 * Score a file path against search keywords.
 * Higher score = more relevant.
 */
export function scorePath(path: string, keywords: string[]): number {
  const p = path.toLowerCase();
  const filename = p.split("/").pop() ?? p;
  let score = 0;

  for (const k of keywords) {
    if (filename.includes(k)) score += 8;
    else if (p.includes(k)) score += 4;
  }

  // Boost for common patterns
  if (
    keywords.some((k) => ["ui", "react", "component", "modal", "page"].includes(k)) &&
    (p.endsWith(".tsx") || p.endsWith(".jsx"))
  ) {
    score += 2;
  }

  if (
    keywords.some((k) => ["api", "route", "endpoint", "server"].includes(k)) &&
    p.includes("/api/")
  ) {
    score += 2;
  }

  if (
    keywords.some((k) => ["auth", "login", "oauth", "nextauth"].includes(k)) &&
    p.includes("auth")
  ) {
    score += 2;
  }

  // Penalize excluded paths
  if (p.includes("node_modules/")) score -= 100;
  if (p.includes(".next/")) score -= 100;
  if (p.endsWith(".lock")) score -= 5;

  return score;
}

/**
 * Fetch repository tree from GitHub API.
 */
export async function fetchRepoTree(
  sessionToken: string,
  owner: string,
  repo: string,
  sha: string
): Promise<TreeItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`GitHub tree API error:`, res.status, errorText);
    throw new Error(`GitHub error ${res.status}: Failed to fetch repository tree`);
  }

  const data = (await res.json()) as { tree?: TreeItem[] };
  return (data?.tree ?? []) as TreeItem[];
}

/**
 * Rank files by relevance to keywords.
 * Returns top N file paths sorted by score.
 * 
 * @param tree - Repository tree items
 * @param keywords - Search keywords
 * @param maxFiles - Maximum number of files to return
 * @returns Array of ranked file paths
 */
export function rankFiles(
  tree: TreeItem[],
  keywords: string[],
  maxFiles: number
): string[] {
  const blobs = tree.filter(
    (t) => t.type === "blob" && typeof t.path === "string"
  ) as Array<{ path: string; type: string; sha: string }>;

  const ranked = blobs
    .map((b) => ({ path: b.path, score: scorePath(b.path, keywords) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(maxFiles * 2, 20))
    .map((r) => r.path);

  return ranked;
}

