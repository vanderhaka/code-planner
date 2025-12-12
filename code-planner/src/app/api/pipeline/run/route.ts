import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { type ProviderId, resolveModelForProvider } from "@/lib/model-catalog";
import { buildContext, callProvider } from "@/lib/providers";

type Provider = ProviderId;

type ModelSelection = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

type PipelineStageModel = {
  provider: Provider;
  modelId: string | null;
};

type PipelineSettings = {
  promptImprover: PipelineStageModel;
  consolidator: PipelineStageModel;
};

type PipelineRunRequest = {
  repo: string; // "owner/name"
  branch: string;
  template: {
    systemPrompt: string;
    userPrompt: string;
  };
  userMessage: string;
  models: Provider[];
  selectedModels: ModelSelection;
  pipeline: PipelineSettings;
};

type TreeItem = { path: string; type: "blob" | "tree" | string; sha: string };

type ImproverResponse = {
  improved_user_prompt?: string;
  search?: {
    keywords?: string[];
    max_files?: number;
  };
};

function safeJsonExtract(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting first {...} block
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateImproverResponse(parsed: unknown): ImproverResponse | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (!("improved_user_prompt" in parsed) && !("search" in parsed)) return null;
  
  const result: ImproverResponse = {};
  
  if ("improved_user_prompt" in parsed && typeof parsed.improved_user_prompt === "string") {
    result.improved_user_prompt = parsed.improved_user_prompt;
  }
  
  if ("search" in parsed && parsed.search && typeof parsed.search === "object") {
    const search = parsed.search as any;
    if (Array.isArray(search.keywords) && search.keywords.every((k: any) => typeof k === "string")) {
      result.search = { keywords: search.keywords };
    }
    if (typeof search.max_files === "number" && Number.isFinite(search.max_files)) {
      result.search = { ...result.search, max_files: search.max_files };
    }
  }
  
  return result;
}

function extractKeywordsFallback(goal: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "that",
    "this",
    "these",
    "those",
    "then",
    "than",
    "your",
    "you",
    "our",
    "are",
    "was",
    "were",
    "will",
    "would",
    "should",
    "could",
    "can",
    "cant",
    "app",
    "code",
    "repo",
    "project",
    "file",
    "files",
    "please",
    "make",
    "add",
    "remove",
    "update",
    "able",
    "using",
    "use",
    "used",
    "run",
    "runs",
  ]);

  const tokens = goal
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !stop.has(t));

  return Array.from(new Set(tokens)).slice(0, 12);
}

function scorePath(path: string, keywords: string[]): number {
  const p = path.toLowerCase();
  const filename = p.split("/").pop() ?? p;
  let score = 0;
  for (const k of keywords) {
    if (filename.includes(k)) score += 8;
    else if (p.includes(k)) score += 4;
  }
  if (keywords.some((k) => ["ui", "react", "component", "modal", "page"].includes(k)) && (p.endsWith(".tsx") || p.endsWith(".jsx")))
    score += 2;
  if (keywords.some((k) => ["api", "route", "endpoint", "server"].includes(k)) && p.includes("/api/")) score += 2;
  if (keywords.some((k) => ["auth", "login", "oauth", "nextauth"].includes(k)) && p.includes("auth")) score += 2;
  if (p.includes("node_modules/")) score -= 100;
  if (p.includes(".next/")) score -= 100;
  if (p.endsWith(".lock")) score -= 5;
  return score;
}

async function fetchFilesWithConcurrency(
  paths: string[],
  fetcher: (path: string) => Promise<string>,
  concurrency = 4
): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await fetcher(path);
          return { path, content };
        } catch (e) {
          console.warn(`Failed to fetch ${path}:`, e);
          return null;
        }
      })
    );
    results.push(...batchResults.filter((r): r is { path: string; content: string } => r !== null && r.content.length > 0));
  }
  return results;
}

async function fetchGitHubJson(sessionToken: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionToken}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchRepoTree(sessionToken: string, owner: string, repo: string, sha: string): Promise<TreeItem[]> {
  const data = await fetchGitHubJson(
    sessionToken,
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
  );
  return (data?.tree ?? []) as TreeItem[];
}

async function fetchRepoFile(sessionToken: string, owner: string, repo: string, path: string, ref: string): Promise<string> {
  // Path should be passed raw - GitHub API handles encoding
  // Only encode the ref query parameter
  const data = await fetchGitHubJson(
    sessionToken,
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  const content = (data?.content as string | undefined) ?? "";
  const encoding = (data?.encoding as string | undefined) ?? "";
  if (encoding === "base64") {
    // GitHub base64 includes newlines sometimes
    const cleaned = content.replace(/\n/g, "");
    return Buffer.from(cleaned, "base64").toString("utf8");
  }
  return String(content ?? "");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as PipelineRunRequest;
    const { repo, branch, template, userMessage, models, selectedModels, pipeline } = body;
    if (!repo || !branch || !template?.systemPrompt || !userMessage || !models?.length) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Validate provider strings
    const VALID_PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "google"]);
    const invalidProviders = models.filter((m) => !VALID_PROVIDERS.has(m));
    if (invalidProviders.length > 0) {
      return NextResponse.json(
        { error: `Invalid providers: ${invalidProviders.join(", ")}` },
        { status: 400 }
      );
    }

    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

    // 1) Prompt improver (JSON)
    const improverProvider = pipeline?.promptImprover?.provider ?? "openai";
    const improverModelId = resolveModelForProvider(
      improverProvider,
      selectedModels || { openai: null, anthropic: null, google: null },
      pipeline?.promptImprover?.modelId ?? null
    );

    const improverUser = `User goal:\n${userMessage.trim()}\n\nTemplate user prompt (constraints / desired output):\n${template.userPrompt}\n\nReturn ONLY valid JSON with this schema:\n{\n  "improved_user_prompt": string,\n  "search": {\n    "keywords": string[],\n    "max_files": number\n  }\n}\n\nGuidelines:\n- improved_user_prompt should incorporate the goal + the template user prompt constraints.\n- keywords should be short identifiers to locate relevant code (components, routes, file names, functions).\n- max_files should be 8-20.\n`;

    const improverRaw = await callProvider(improverProvider, template.systemPrompt, improverUser, improverModelId);
    const improverParsed = safeJsonExtract(improverRaw);
    const improverJson = validateImproverResponse(improverParsed);
    
    const improvedUserPrompt: string =
      improverJson?.improved_user_prompt ?? `${template.userPrompt}\n\nUser goal:\n${userMessage.trim()}`;

    const keywords: string[] =
      improverJson?.search?.keywords && improverJson.search.keywords.length > 0
        ? improverJson.search.keywords.slice(0, 20)
        : extractKeywordsFallback(userMessage);

    const maxFiles: number =
      typeof improverJson?.search?.max_files === "number" && Number.isFinite(improverJson.search.max_files)
        ? Math.min(Math.max(Math.floor(improverJson.search.max_files), 4), 25)
        : 12;

    // 2) Repo search (tree + scoring)
    const tree = await fetchRepoTree(session.accessToken, owner, repoName, branch);
    const blobs = tree.filter((t) => t.type === "blob" && typeof t.path === "string") as Array<{ path: string; type: string; sha: string }>;
    const ranked = blobs
      .map((b) => ({ path: b.path, score: scorePath(b.path, keywords) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(maxFiles * 2, 20))
      .map((r) => r.path);

    if (ranked.length === 0) {
      return NextResponse.json(
        {
          error: "No relevant files found from repo search. Try a more specific goal (component name, route path, file names).",
        },
        { status: 400 },
      );
    }

    // 3) Load file contents (caps)
    const MAX_TOTAL_CHARS = 220_000;
    const MAX_FILE_CHARS = 30_000;
    const selectedPaths: string[] = [];
    const files: Array<{ path: string; content: string }> = [];
    let totalChars = 0;

    // Fetch files with concurrency limit
    const pathsToFetch = ranked.slice(0, maxFiles);
    const accessToken = session.accessToken; // Type narrowing: already checked above
    const fetchedFiles = await fetchFilesWithConcurrency(
      pathsToFetch,
      async (path) => {
        const content = await fetchRepoFile(accessToken, owner, repoName, path, branch);
        // Skip oversized files
        if (content.length > MAX_FILE_CHARS) {
          return "";
        }
        return content;
      },
      4 // concurrency limit
    );

    // Apply total character limit
    for (const file of fetchedFiles) {
      if (totalChars + file.content.length > MAX_TOTAL_CHARS) break;
      totalChars += file.content.length;
      selectedPaths.push(file.path);
      files.push(file);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Found file paths but could not load contents within caps." }, { status: 400 });
    }

    // 4) Call each enabled provider with system + improved prompt + files
    const context = buildContext(files);
    const finalUserPrompt = `${improvedUserPrompt}\n\n${context}`;

    const results = await Promise.all(
      models.map(async (m) => {
        const modelId = resolveModelForProvider(
          m,
          selectedModels || { openai: null, anthropic: null, google: null },
          null
        );
        const output = await callProvider(m, template.systemPrompt, finalUserPrompt, modelId);
        return { model: m, output };
      }),
    );

    // 5) Consolidate
    const consolidationPrompt = `You are given independent reviews of the same code/files. Synthesize them into a single, concise, actionable plan. Preserve the most important insights and resolve any conflicts. Do not add new opinions beyond what the reviews contain.

Reviews:
${results.map((r) => `--- ${r.model.toUpperCase()} ---\n${r.output}`).join("\n\n")}

Synthesized plan:`;

    const consolidatorProvider = pipeline?.consolidator?.provider ?? "openai";
    const consolidatorModelId = resolveModelForProvider(
      consolidatorProvider,
      selectedModels || { openai: null, anthropic: null, google: null },
      pipeline?.consolidator?.modelId ?? null
    );
    const consolidated = await callProvider(consolidatorProvider, template.systemPrompt, consolidationPrompt, consolidatorModelId);

    return NextResponse.json({
      results,
      consolidated,
      meta: {
        repo,
        branch,
        selectedFiles: selectedPaths,
        keywords,
        promptImprover: { provider: improverProvider, modelId: improverModelId },
        consolidator: { provider: consolidatorProvider, modelId: consolidatorModelId },
      },
    });
  } catch (e) {
    console.error("Pipeline run error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}


