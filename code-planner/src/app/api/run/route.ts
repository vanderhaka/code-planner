import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GOOGLE_MODEL,
  validateModelId,
  type ProviderId,
} from "@/lib/model-catalog";

type Model = ProviderId;

type ModelSelection = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

type RunRequest = {
  template: {
    systemPrompt: string;
    userPrompt: string;
  };
  userMessage?: string;
  files: Array<{ path: string; content: string }>;
  models: Model[];
  selectedModels: ModelSelection;
};

function buildContext(files: Array<{ path: string; content: string }>): string {
  return files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n");
}

/**
 * Pick a valid OpenAI chat model ID.
 * Validates against the allowlist and falls back to default if invalid.
 */
function pickOpenAIChatModelId(requested: string | null | undefined): string {
  return validateModelId("openai", requested);
}

async function callOpenAI(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId || DEFAULT_OPENAI_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`OpenAI API error (${res.status}):`, errorText);
      throw new Error(`OpenAI error: ${res.status} - ${errorText}`);
    }
    
    const data = (await res.json()) as any;
    return data.choices[0]?.message?.content ?? "";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("OpenAI request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAnthropic(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  
  const validatedModelId = validateModelId("anthropic", modelId);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: validatedModelId || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Anthropic API error (${res.status}):`, errorText);
      throw new Error(`Anthropic error: ${res.status} - ${errorText}`);
    }
    
    const data = (await res.json()) as any;
    return data.content[0]?.text ?? "";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Anthropic request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGoogle(system: string, user: string, modelId: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY missing");
  
  const modelName = modelId || DEFAULT_GOOGLE_MODEL;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `System: ${system}\n\nUser: ${user}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Google AI API error (${res.status}):`, errorText);
      throw new Error(`Google error: ${res.status} - ${errorText}`);
    }
    
    const data = (await res.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Google AI request timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runModel(
  model: Model,
  system: string,
  user: string,
  selectedModels: ModelSelection
): Promise<{ model: Model; output: string }> {
  let output = "";
  const modelId = selectedModels[model];
  switch (model) {
    case "openai":
      output = await callOpenAI(system, user, pickOpenAIChatModelId(modelId));
      break;
    case "anthropic":
      output = await callAnthropic(system, user, modelId || "");
      break;
    case "google":
      output = await callGoogle(system, user, modelId || "");
      break;
    default:
      throw new Error(`Unsupported model: ${model}`);
  }
  return { model, output };
}

async function consolidate(
  responses: { model: Model; output: string }[],
  system: string,
  user: string,
  selectedModels: ModelSelection
): Promise<string> {
  const consolidationPrompt = `You are given three independent reviews of the same code/files. Synthesize them into a single, concise, actionable plan. Preserve the most important insights and resolve any conflicts. Do not add new opinions beyond what the three reviews contain.

Reviews:
${responses.map((r) => `--- ${r.model.toUpperCase()} ---\n${r.output}`).join("\n\n")}

Synthesized plan:`;

  // Use OpenAI for consolidation by default, fallback to first selected model if OpenAI not available
  return callOpenAI(system, consolidationPrompt, pickOpenAIChatModelId(selectedModels.openai));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RunRequest;
    const { template, files, models, selectedModels, userMessage } = body;
    if (!template?.systemPrompt || !template?.userPrompt || !files?.length || !models?.length) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const context = buildContext(files);
    const trimmedUserMessage = userMessage?.trim();
    const userPromptWithFiles = trimmedUserMessage
      ? `${template.userPrompt}\n\nUser goal:\n${trimmedUserMessage}\n\n${context}`
      : `${template.userPrompt}\n\n${context}`;

    // Run all models in parallel
    const results = await Promise.all(
      models.map((m) => runModel(m, template.systemPrompt, userPromptWithFiles, selectedModels || {
        openai: null,
        anthropic: null,
        google: null,
      }))
    );

    // Consolidate
    const consolidated = await consolidate(
      results,
      template.systemPrompt,
      userPromptWithFiles,
      selectedModels || {
        openai: null,
        anthropic: null,
        google: null,
      }
    );

    return NextResponse.json({ results, consolidated });
  } catch (e) {
    console.error("Run error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
