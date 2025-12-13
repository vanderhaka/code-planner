import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { type ProviderId, resolveModelForProvider } from "@/lib/model-catalog";
import { callProvider } from "@/lib/providers";
import { parseScope, type ParsedScope, matchesGlob, getScopeDescription } from "@/lib/scope-parser";
import {
  type ReviewAgent,
  getAgentPrompt,
  buildAgentUserPrompt,
  DEFAULT_AGENT_CONFIG,
} from "@/lib/review-modes";

type TreeItem = { path: string; type: "blob" | "tree" | string; sha: string };

type AgentRunRequest = {
  repo: string; // "owner/name"
  branch: string;
  template: {
    systemPrompt: string;
  };
  userMessage: string;
  scope?: string | null; // Scope argument (file path, glob, commit count, or empty)
  models: ProviderId[];
  selectedModels: {
    openai: string | null;
    anthropic: string | null;
    google: string | null;
  };
  agentConfig?: {
    enabledAgents: ReviewAgent[];
    includeConfidence: boolean;
  };
};

type AgentResult = {
  agent: ReviewAgent;
  output: string;
  provider: ProviderId;
  modelId: string | null;
};

type AgentRunResponse = {
  results: AgentResult[];
  synthesized: string;
  meta: {
    repo: string;
    branch: string;
    scope: ParsedScope;
    scopeDescription: string;
    selectedFiles: string[];
    agents: ReviewAgent[];
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

async function fetchGitHubJson(sessionToken: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionToken}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const errorText = await res.text();
    // Log full error server-side for debugging
    console.error(`GitHub API error (${res.status}):`, errorText);
    // Return generic error to client (don't leak sensitive GitHub API details)
    throw new Error(`GitHub error ${res.status}: Failed to fetch`);
  }
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
    const cleaned = content.replace(/\n/g, "");
    return Buffer.from(cleaned, "base64").toString("utf8");
  }
  return String(content ?? "");
}

/**
 * Fetch files changed in recent commits using GitHub API.
 * Optimized: Uses Promise.all for parallel commit detail fetching.
 */
async function fetchCommitFiles(
  sessionToken: string,
  owner: string,
  repo: string,
  branch: string,
  commitCount: number
): Promise<string[]> {
  try {
    // Get commits
    const commitsData = await fetchGitHubJson(
      sessionToken,
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${commitCount}`
    );
    
    if (!Array.isArray(commitsData) || commitsData.length === 0) {
      return [];
    }
    
    // Fetch commit details in parallel (max 5 concurrent requests)
    const fileSet = new Set<string>();
    const commitShas = commitsData.map((c: any) => c.sha as string);
    
    // Process in batches of 5 for rate limit safety
    const BATCH_SIZE = 5;
    for (let i = 0; i < commitShas.length; i += BATCH_SIZE) {
      const batch = commitShas.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (sha) => {
          try {
            return await fetchGitHubJson(
              sessionToken,
              `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`
            );
          } catch {
            return null;
          }
        })
      );
      
      for (const commitData of batchResults) {
        if (commitData?.files && Array.isArray(commitData.files)) {
          for (const file of commitData.files) {
            if (file.filename && file.status !== "removed") {
              fileSet.add(file.filename);
            }
          }
        }
      }
    }
    
    return Array.from(fileSet);
  } catch (e) {
    console.error("Failed to fetch commit files:", e);
    return [];
  }
}

/**
 * Resolve file paths based on scope.
 */
async function resolveFilesFromScope(
  sessionToken: string,
  owner: string,
  repo: string,
  branch: string,
  scope: ParsedScope
): Promise<string[]> {
  if (scope.type === "file") {
    // Single file path
    return [scope.value];
  }
  
  if (scope.type === "glob") {
    // Get all files and filter by glob
    const tree = await fetchRepoTree(sessionToken, owner, repo, branch);
    const blobs = tree.filter((t) => t.type === "blob" && typeof t.path === "string") as Array<{ path: string }>;
    return blobs
      .map((b) => b.path)
      .filter((path) => matchesGlob(path, scope.value));
  }
  
  if (scope.type === "commits" && scope.commitCount) {
    // Files changed in last N commits
    return await fetchCommitFiles(sessionToken, owner, repo, branch, scope.commitCount);
  }
  
  if (scope.type === "empty") {
    // Default: files changed in last commit
    return await fetchCommitFiles(sessionToken, owner, repo, branch, 1);
  }
  
  // Invalid scope - return empty
  return [];
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

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // Capture access token after validation for type narrowing
    const accessToken = session.accessToken;

    const body = (await req.json()) as AgentRunRequest;
    const { repo, branch, template, userMessage, scope, models, selectedModels, agentConfig } = body;
    
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

    // Parse scope
    const parsedScope = parseScope(scope);
    if (parsedScope.type === "invalid") {
      return NextResponse.json(
        { error: `Invalid scope: ${parsedScope.value}. Use a file path, glob pattern, commit count, or leave empty.` },
        { status: 400 }
      );
    }

    // Resolve files from scope
    const filePaths = await resolveFilesFromScope(accessToken, owner, repoName, branch, parsedScope);
    
    if (filePaths.length === 0) {
      return NextResponse.json(
        { error: `No files found for scope: ${getScopeDescription(parsedScope)}` },
        { status: 400 }
      );
    }

    // Fetch file contents (with limits)
    const MAX_TOTAL_CHARS = 220_000;
    const MAX_FILE_CHARS = 30_000;
    const selectedPaths: string[] = [];
    const files: Array<{ path: string; content: string }> = [];
    let totalChars = 0;

    const fetchedFiles = await fetchFilesWithConcurrency(
      filePaths.slice(0, 25), // Limit to 25 files
      async (path) => {
        const content = await fetchRepoFile(accessToken, owner, repoName, path, branch);
        if (content.length > MAX_FILE_CHARS) {
          return "";
        }
        return content;
      },
      4
    );

    for (const file of fetchedFiles) {
      if (totalChars + file.content.length > MAX_TOTAL_CHARS) break;
      totalChars += file.content.length;
      selectedPaths.push(file.path);
      files.push(file);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Found file paths but could not load contents within caps." },
        { status: 400 }
      );
    }

    // Get agent configuration
    const config = agentConfig || DEFAULT_AGENT_CONFIG;
    const enabledAgents = config.enabledAgents.length > 0
      ? config.enabledAgents
      : DEFAULT_AGENT_CONFIG.enabledAgents;
    
    if (enabledAgents.length === 0) {
      return NextResponse.json(
        { error: "At least one agent must be enabled. Configure agents in Settings." },
        { status: 400 }
      );
    }

    // Build user prompt with files
    const userPrompt = buildAgentUserPrompt(files, userMessage);

    // Run agents in parallel, distributing across available providers
    console.log("[Agents] Running agents:", enabledAgents);
    const agentResults = await Promise.all(
      enabledAgents.map(async (agent, index): Promise<AgentResult> => {
        // Round-robin across available providers to distribute load
        const provider = models[index % models.length];
        const modelId = resolveModelForProvider(
          provider,
          selectedModels || { openai: null, anthropic: null, google: null },
          null
        );
        
        const agentSystemPrompt = getAgentPrompt(agent);
        const output = await callProvider(provider, agentSystemPrompt, userPrompt, modelId);
        
        return {
          agent,
          output,
          provider,
          modelId,
        };
      })
    );

    // Synthesize findings
    const synthesisPrompt = `You are synthesizing findings from multiple specialized code review agents.

Agent Reviews:
${agentResults.map((r) => `--- ${r.agent.toUpperCase().replace(/-/g, " ")} (${r.provider.toUpperCase()}) ---\n${r.output}`).join("\n\n")}

Synthesize these findings into a unified report with:

1. Summary Dashboard:
   - Files Reviewed: ${files.length}
   - Total Findings by Severity (Critical, High, Medium, Low)
   - Security Issues Count
   - Performance Issues Count
   - Large Files Count (>300 LOC)

2. Priority Action List:
   - Fix Immediately (Critical/Security)
   - Fix This PR (High)
   - Fix This Sprint (Medium)
   - Backlog (Low/Tech debt)

3. Detailed Findings (grouped by severity)

4. Refactoring Plans (if any large files identified)

Be concise but comprehensive. Focus on actionable insights.`;

    const synthesizerProvider = models[0];
    const synthesizerModelId = resolveModelForProvider(
      synthesizerProvider,
      selectedModels || { openai: null, anthropic: null, google: null },
      null
    );
    
    console.log("[Agents] Synthesizing findings");
    const synthesized = await callProvider(
      synthesizerProvider,
      template.systemPrompt,
      synthesisPrompt,
      synthesizerModelId
    );

    // Optional confidence evaluation
    let confidence;
    if (config.includeConfidence) {
      const confidencePrompt = `Evaluate the confidence level for implementing the findings from this code review.

Review Summary:
${synthesized}

Rate your confidence (0-100%) on:
1. Understanding the problem: _%
2. Understanding the codebase context: _%
3. Knowing the correct solution: _%
4. No unintended side effects: _%

Provide an overall confidence score and recommendation:
- 100%: Proceed with fix
- 90-99%: Proceed, note uncertainty
- 70-89%: Ask user before proceeding
- <70%: Do NOT proceed, explain gaps

Return ONLY valid JSON:
{
  "score": number (0-100),
  "breakdown": {
    "understanding": number,
    "solution": number,
    "sideEffects": number
  },
  "recommendation": "proceed" | "ask" | "stop"
}`;

      try {
        const confidenceRaw = await callProvider(
          synthesizerProvider,
          template.systemPrompt,
          confidencePrompt,
          synthesizerModelId
        );
        
        // Try to extract JSON
        const jsonMatch = confidenceRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.score !== undefined && parsed.recommendation) {
            confidence = {
              score: Math.max(0, Math.min(100, parsed.score || 0)),
              breakdown: {
                understanding: Math.max(0, Math.min(100, parsed.breakdown?.understanding || 0)),
                solution: Math.max(0, Math.min(100, parsed.breakdown?.solution || 0)),
                sideEffects: Math.max(0, Math.min(100, parsed.breakdown?.sideEffects || 0)),
              },
              recommendation: ["proceed", "ask", "stop"].includes(parsed.recommendation)
                ? parsed.recommendation
                : "ask",
            };
          }
        }
      } catch (e) {
        console.warn("Failed to evaluate confidence:", e);
      }
    }

    return NextResponse.json({
      results: agentResults,
      synthesized,
      meta: {
        repo,
        branch,
        scope: parsedScope,
        scopeDescription: getScopeDescription(parsedScope),
        selectedFiles: selectedPaths,
        agents: enabledAgents,
      },
      confidence,
    } as AgentRunResponse);
  } catch (e) {
    const error = e as Error;
    console.error("Agent run error:", error);
    console.error("Agent run error stack:", error.stack);
    return NextResponse.json(
      {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

