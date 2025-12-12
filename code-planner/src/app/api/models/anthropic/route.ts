import { NextResponse } from "next/server";
import { ANTHROPIC_MODELS } from "@/lib/model-catalog";

/**
 * Anthropic models endpoint.
 * 
 * Anthropic doesn't provide a models list API, so we return a hardcoded
 * allowlist of currently supported Claude models. This list is maintained
 * in the centralized model catalog.
 */
export async function GET() {
  try {
    // Return allowlist from centralized catalog
    const models = ANTHROPIC_MODELS.sort((a, b) => {
      // Prioritize Claude 4 models, then 3.7, then 3.5
      if (a.id.startsWith("claude-opus-4") || a.id.startsWith("claude-sonnet-4")) {
        if (!b.id.startsWith("claude-opus-4") && !b.id.startsWith("claude-sonnet-4")) return -1;
      }
      if (b.id.startsWith("claude-opus-4") || b.id.startsWith("claude-sonnet-4")) {
        if (!a.id.startsWith("claude-opus-4") && !a.id.startsWith("claude-sonnet-4")) return 1;
      }
      return b.id.localeCompare(a.id); // Newer/lexicographically later first
    });

    return NextResponse.json({ models, error: null });
  } catch (e) {
    console.error("Error in Anthropic models endpoint:", e);
    return NextResponse.json(
      { models: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}

