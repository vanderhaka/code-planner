import { NextRequest, NextResponse } from "next/server";
import { type ProviderId } from "@/lib/model-catalog";
import { buildContext, callProvider } from "@/lib/providers";

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

async function runModel(
  model: Model,
  system: string,
  user: string,
  selectedModels: ModelSelection
): Promise<{ model: Model; output: string }> {
  const modelId = selectedModels[model];
  const output = await callProvider(model, system, user, modelId);
  return { model, output };
}

async function consolidate(
  responses: { model: Model; output: string }[],
  system: string,
  user: string,
  selectedModels: ModelSelection
): Promise<string> {
  const consolidationPrompt = `You are given independent reviews of the same code/files. Synthesize them into a single, concise, actionable plan. Preserve the most important insights and resolve any conflicts. Do not add new opinions beyond what the reviews contain.

Reviews:
${responses.map((r) => `--- ${r.model.toUpperCase()} ---\n${r.output}`).join("\n\n")}

Synthesized plan:`;

  // Try providers in order: OpenAI -> Anthropic -> Google
  // Use the first available provider with a valid API key
  const providers: ProviderId[] = ["openai", "anthropic", "google"];
  
  for (const provider of providers) {
    const apiKey = 
      provider === "openai" ? process.env.OPENAI_API_KEY :
      provider === "anthropic" ? process.env.ANTHROPIC_API_KEY :
      process.env.GOOGLE_AI_API_KEY;
    
    if (apiKey) {
      try {
        const modelId = selectedModels[provider];
        return await callProvider(provider, system, consolidationPrompt, modelId);
      } catch (e) {
        // If this provider fails, try the next one
        console.warn(`Consolidation failed with ${provider}, trying next provider:`, e);
        continue;
      }
    }
  }
  
  // If all providers failed, throw an error
  throw new Error("No available provider for consolidation");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RunRequest;
    const { template, files, models, selectedModels, userMessage } = body;
    if (!template?.systemPrompt || !template?.userPrompt || !files?.length || !models?.length) {
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

    const context = buildContext(files);
    const trimmedUserMessage = userMessage?.trim();
    const userPromptWithFiles = trimmedUserMessage
      ? `${template.userPrompt}\n\nUser goal:\n${trimmedUserMessage}\n\n${context}`
      : `${template.userPrompt}\n\n${context}`;

    const defaultSelectedModels: ModelSelection = {
      openai: null,
      anthropic: null,
      google: null,
    };

    // Run all models in parallel
    const results = await Promise.all(
      models.map((m) => runModel(m, template.systemPrompt, userPromptWithFiles, selectedModels || defaultSelectedModels))
    );

    // Consolidate
    const consolidated = await consolidate(
      results,
      template.systemPrompt,
      userPromptWithFiles,
      selectedModels || defaultSelectedModels
    );

    return NextResponse.json({ results, consolidated });
  } catch (e) {
    console.error("Run error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
