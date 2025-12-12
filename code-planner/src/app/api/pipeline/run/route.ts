import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

type Provider = "openai" | "anthropic" | "google";

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

const DEFAULT_OPENAI_CHAT_MODEL = "gpt-5.2-chat-latest";

function pickOpenAIChatModelId(requested: string | null | undefined): string {
  if (!requested) return DEFAULT_OPENAI_CHAT_MODEL;
  if (requested.startsWith("gpt-5") && requested.includes("chat")) return requested;
  return DEFAULT_OPENAI_CHAT_MODEL;
}

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

function buildContext(files: Array<{ path: string; content: string }>): string {
  return files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n");
}

async function callOpenAI(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: pickOpenAIChatModelId(modelId),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId || "claude-sonnet-4-5",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.content[0]?.text ?? "";
}

async function callGoogle(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY missing");
  const modelName = modelId || "gemini-2.5-pro";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `System: ${system}\n\nUser: ${user}` }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google error: ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callProvider(provider: Provider, system: string, user: string, modelId: string | null): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAI(system, user, modelId ?? DEFAULT_OPENAI_CHAT_MODEL);
    case "anthropic":
      return callAnthropic(system, user, modelId ?? "");
    case "google":
      return callGoogle(system, user, modelId ?? "");
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
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

    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

    // 1) Prompt improver (JSON)
    const improverProvider = pipeline?.promptImprover?.provider ?? "openai";
    const improverModelId =
      pipeline?.promptImprover?.modelId ??
      (improverProvider === "openai" ? DEFAULT_OPENAI_CHAT_MODEL : selectedModels[improverProvider] ?? null);

    const improverUser = `User goal:\n${userMessage.trim()}\n\nTemplate user prompt (constraints / desired output):\n${template.userPrompt}\n\nReturn ONLY valid JSON with this schema:\n{\n  "improved_user_prompt": string,\n  "search": {\n    "keywords": string[],\n    "max_files": number\n  }\n}\n\nGuidelines:\n- improved_user_prompt should incorporate the goal + the template user prompt constraints.\n- keywords should be short identifiers to locate relevant code (components, routes, file names, functions).\n- max_files should be 8-20.\n`;

    const improverRaw = await callProvider(improverProvider, template.systemPrompt, improverUser, improverModelId);
    const improverJson = safeJsonExtract(improverRaw) as any;
    const improvedUserPrompt: string =
      typeof improverJson?.improved_user_prompt === "string"
        ? improverJson.improved_user_prompt
        : `${template.userPrompt}\n\nUser goal:\n${userMessage.trim()}`;

    const keywords: string[] =
      Array.isArray(improverJson?.search?.keywords) && improverJson.search.keywords.every((k: any) => typeof k === "string")
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
    const selectedPaths: string[] = [];
    const files: Array<{ path: string; content: string }> = [];
    let totalChars = 0;

    for (const p of ranked) {
      if (files.length >= maxFiles) break;
      const encodedPath = p
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
      const content = await fetchRepoFile(session.accessToken, owner, repoName, encodedPath, branch);
      if (!content) continue;
      if (totalChars + content.length > MAX_TOTAL_CHARS) continue;
      totalChars += content.length;
      selectedPaths.push(p);
      files.push({ path: p, content });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Found file paths but could not load contents within caps." }, { status: 400 });
    }

    // 4) Call each enabled provider with system + improved prompt + files
    const context = buildContext(files);
    const finalUserPrompt = `${improvedUserPrompt}\n\n${context}`;

    const results = await Promise.all(
      models.map(async (m) => {
        const modelId = selectedModels[m] ?? null;
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
    const consolidatorModelId =
      pipeline?.consolidator?.modelId ??
      (consolidatorProvider === "openai" ? DEFAULT_OPENAI_CHAT_MODEL : selectedModels[consolidatorProvider] ?? null);
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


