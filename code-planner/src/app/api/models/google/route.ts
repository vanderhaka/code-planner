import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const cacheKey = "google-models";
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { models: [], error: "GOOGLE_AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for model listing

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: controller.signal }
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return NextResponse.json(
          { models: [], error: "Request timeout" },
          { status: 500 }
        );
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Google AI API error (${res.status}):`, errorText);
      return NextResponse.json(
        { models: [], error: `Google AI API error: ${res.status} - ${errorText}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    // Filter to generative models that support generateContent
    // Broaden filter slightly: check for "gemini" in name (not just startsWith)
    // but still require supportedGenerationMethods to ensure it's usable
    const generativeModels =
      data.models
        ?.filter(
          (model) =>
            model.name.includes("gemini") &&
            model.supportedGenerationMethods?.includes("generateContent") &&
            !model.name.includes("deprecated") &&
            !model.name.includes("realtime") // Exclude realtime models
        )
        .map((model) => ({
          id: model.name.replace("models/", ""),
          name: model.displayName || model.name.replace("models/", ""),
        }))
        .sort((a, b) => {
          // Prioritize newer models (gemini-2.x, gemini-1.5) over older ones
          if (a.id.startsWith("gemini-2") && !b.id.startsWith("gemini-2")) return -1;
          if (!a.id.startsWith("gemini-2") && b.id.startsWith("gemini-2")) return 1;
          if (a.id.startsWith("gemini-1.5") && !b.id.startsWith("gemini-1.5")) return -1;
          if (!a.id.startsWith("gemini-1.5") && b.id.startsWith("gemini-1.5")) return 1;
          return b.id.localeCompare(a.id); // Newer/lexicographically later first
        }) ?? [];

    const response = { models: generativeModels, error: null };
    setCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (e) {
    console.error("Error fetching Google models:", e);
    return NextResponse.json(
      { models: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}

