import { NextResponse } from "next/server";
import { ANTHROPIC_MODELS } from "@/lib/model-catalog";

type ModelListResponse = {
  models: Array<{ id: string; name: string }>;
  error: string | null;
};

type CacheEntry = { data: ModelListResponse; expiry: number };

/**
 * Simple in-memory cache with TTL for model lists.
 */
const cache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): ModelListResponse | null {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key: string, data: ModelListResponse) {
  cache.set(key, {
    data,
    expiry: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Anthropic models endpoint.
 * 
 * Anthropic doesn't provide a models list API, so we return a hardcoded
 * allowlist of currently supported Claude models. This list is maintained
 * in the centralized model catalog.
 */
export async function GET() {
  try {
    const cacheKey = "anthropic-models";
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Return allowlist from centralized catalog
    const models = [...ANTHROPIC_MODELS].sort((a, b) => {
      // Prioritize Claude 4 models, then 3.7, then 3.5
      if (a.id.startsWith("claude-opus-4") || a.id.startsWith("claude-sonnet-4")) {
        if (!b.id.startsWith("claude-opus-4") && !b.id.startsWith("claude-sonnet-4")) return -1;
      }
      if (b.id.startsWith("claude-opus-4") || b.id.startsWith("claude-sonnet-4")) {
        if (!a.id.startsWith("claude-opus-4") && !a.id.startsWith("claude-sonnet-4")) return 1;
      }
      return b.id.localeCompare(a.id); // Newer/lexicographically later first
    });

    const response = { models, error: null };
    setCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (e) {
    console.error("Error in Anthropic models endpoint:", e);
    return NextResponse.json(
      { models: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}

