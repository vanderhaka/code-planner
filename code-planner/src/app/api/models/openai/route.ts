import { NextResponse } from "next/server";
import { OPENAI_CHAT_MODELS } from "@/lib/model-catalog";

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
 * OpenAI models endpoint.
 * 
 * IMPORTANT: OpenAI's /v1/models endpoint is an inventory of all models
 * and does NOT reliably encode chat capability. We use an allowlist of
 * known chat-capable models instead of filtering /v1/models to avoid
 * returning non-chat models that would fail when used with /v1/chat/completions.
 */
export async function GET() {
  try {
    const cacheKey = "openai-models";
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Return allowlist directly - no need to call /v1/models
    // This ensures we only return models that work with /v1/chat/completions
    // Models are already ordered in the catalog (newest first), just copy array
    const models = [...OPENAI_CHAT_MODELS];
    const response = { models, error: null };

    setCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (e) {
    console.error("Error in OpenAI models endpoint:", e);
    return NextResponse.json(
      { models: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}

