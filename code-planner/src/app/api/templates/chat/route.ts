import { NextRequest, NextResponse } from "next/server";
import { type ProviderId, resolveModelForProvider } from "@/lib/model-catalog";
import { callProvider } from "@/lib/providers";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  provider: ProviderId;
  modelId: string | null;
  existingSystemPrompt?: string;
};

const TEMPLATE_ASSISTANT_SYSTEM_PROMPT = `You are an AI assistant helping users create effective prompt templates for code review and planning tasks.

Your role is to:
1. Ask clarifying questions about what the template should accomplish
2. Understand the use case, target scenarios, and desired behavior
3. Suggest improvements and best practices
4. Generate a polished, comprehensive system prompt when the user is ready

Guidelines for the system prompt you'll generate:
- Be specific about the AI's role and responsibilities
- Include clear instructions on how to analyze code
- Specify the format and structure of outputs
- Include any constraints or requirements
- Make it actionable and clear

When the user seems ready (they've answered your questions or explicitly asks you to generate the prompt), provide a complete system prompt that can be used directly in the template.

Keep your responses conversational and helpful. Ask one or two questions at a time to avoid overwhelming the user.`;

export async function POST(req: NextRequest) {
  // Declare these outside try block so they're accessible in catch
  let provider: string | undefined;
  let modelId: string | null | undefined;

  try {
    const body = (await req.json()) as ChatRequest;
    const { messages, existingSystemPrompt } = body;
    provider = body.provider;
    modelId = body.modelId;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array required" }, { status: 400 });
    }

    if (!provider || !["openai", "anthropic", "google"].includes(provider)) {
      return NextResponse.json({ error: "Valid provider required" }, { status: 400 });
    }

    // Build conversation context
    const systemPrompt = existingSystemPrompt
      ? `${TEMPLATE_ASSISTANT_SYSTEM_PROMPT}\n\nCurrent system prompt (for reference/refinement):\n${existingSystemPrompt}`
      : TEMPLATE_ASSISTANT_SYSTEM_PROMPT;

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
    }

    // Build conversation history into a single user message
    // Include all previous messages for context
    const conversationHistory = messages
      .slice(0, -1) // All messages except the last one
      .map((m) => {
        if (m.role === "user") {
          return `User: ${m.content}`;
        } else {
          return `Assistant: ${m.content}`;
        }
      })
      .join("\n\n");

    const userMessage = conversationHistory
      ? `${conversationHistory}\n\nUser: ${lastMessage.content}`
      : lastMessage.content;

    const validProvider = provider as "openai" | "anthropic" | "google";
    const validatedModelId = resolveModelForProvider(validProvider, { openai: null, anthropic: null, google: null }, modelId ?? null);
    
    // Debug logging
    console.log("[Template Chat] Provider:", provider);
    console.log("[Template Chat] Requested modelId:", modelId);
    console.log("[Template Chat] Validated modelId:", validatedModelId);
    
    const response = await callProvider(validProvider, systemPrompt, userMessage, validatedModelId);

    return NextResponse.json({ content: response });
  } catch (e) {
    const error = e as Error;
    console.error("Template chat error:", error);
    console.error("Error details:", {
      provider: provider ?? "unknown",
      requestedModelId: modelId ?? null,
    });
    return NextResponse.json({ 
      error: error.message,
      debug: {
        provider: provider ?? "unknown",
        requestedModelId: modelId ?? null,
      }
    }, { status: 500 });
  }
}

