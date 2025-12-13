/**
 * File loading: concurrent fetch with character limits and early termination.
 */

import { sanitizeFileContent } from "@/lib/sanitizer";
import type { FileWithContent } from "./types";

const MAX_TOTAL_CHARS = 220_000;
const MAX_FILE_CHARS = 30_000;

/**
 * Fetch a single file from GitHub.
 */
async function fetchRepoFile(
  sessionToken: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
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
    console.error(`GitHub file API error for ${path}:`, res.status, errorText);
    throw new Error(`GitHub error ${res.status}: Failed to fetch file`);
  }

  const data = (await res.json()) as { content?: string; encoding?: string };
  const content = (data?.content as string | undefined) ?? "";
  const encoding = (data?.encoding as string | undefined) ?? "";

  if (encoding === "base64") {
    const cleaned = content.replace(/\n/g, "");
    return Buffer.from(cleaned, "base64").toString("utf8");
  }

  return String(content ?? "");
}

/**
 * Fetch files with concurrency limit and early termination when character cap is reached.
 * 
 * @param paths - File paths to fetch
 * @param sessionToken - GitHub session token
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch/ref to fetch from
 * @param concurrency - Maximum concurrent requests (default: 4)
 * @returns Array of files with content, stopped early if cap reached
 */
export async function fetchFilesWithEarlyTermination(
  paths: string[],
  sessionToken: string,
  owner: string,
  repo: string,
  branch: string,
  concurrency = 4
): Promise<FileWithContent[]> {
  const results: FileWithContent[] = [];
  let totalChars = 0;

  // Process in batches
  for (let i = 0; i < paths.length; i += concurrency) {
    // Check if we've reached the cap
    if (totalChars >= MAX_TOTAL_CHARS) {
      break;
    }

    const batch = paths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await fetchRepoFile(sessionToken, owner, repo, path, branch);
          
          // Skip oversized files
          if (content.length > MAX_FILE_CHARS) {
            console.warn(`Skipping oversized file: ${path} (${content.length} chars)`);
            return null;
          }

          // Sanitize content
          const sanitized = sanitizeFileContent(content, MAX_FILE_CHARS);

          return { path, content: sanitized };
        } catch (e) {
          console.warn(`Failed to fetch ${path}:`, e);
          return null;
        }
      })
    );

    // Add valid results, stopping if cap reached
    for (const file of batchResults) {
      if (!file) continue;

      // Check if adding this file would exceed the cap
      if (totalChars + file.content.length > MAX_TOTAL_CHARS) {
        // Try to add partial content if possible
        const remaining = MAX_TOTAL_CHARS - totalChars;
        if (remaining > 1000) {
          // Only add if we can fit at least 1KB
          file.content = file.content.slice(0, remaining);
          results.push(file);
        }
        return results;
      }

      totalChars += file.content.length;
      results.push(file);
    }
  }

  return results;
}

