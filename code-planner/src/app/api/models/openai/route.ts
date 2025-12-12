import { NextResponse } from "next/server";
import { OPENAI_CHAT_MODELS } from "@/lib/model-catalog";

/**
 * OpenAI models endpoint.
 * 
 * IMPORTANT: OpenAI's /v1/models endpoint is an inventory of all models
 * and does NOT reliably encode chat capability. We use an allowlist of
 * known chat-capable models instead of filtering /v1/models to avoid
 * returning non-chat models that would fail when used with /v1/chat/completions.
 */
export async function GET() {
  try {
    // Return allowlist directly - no need to call /v1/models
    // This ensures we only return models that work with /v1/chat/completions
    // Models are already ordered in the catalog (newest first), just copy array
    const models = [...OPENAI_CHAT_MODELS];

    return NextResponse.json(
      { models, error: null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (e) {
    console.error("Error in OpenAI models endpoint:", e);
    return NextResponse.json(
      { models: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}

