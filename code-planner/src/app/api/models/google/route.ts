import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Google AI API error: ${res.status}` },
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
    const generativeModels =
      data.models
        ?.filter(
          (model) =>
            model.name.startsWith("models/gemini-") &&
            model.supportedGenerationMethods?.includes("generateContent")
        )
        .map((model) => ({
          id: model.name.replace("models/", ""),
          name: model.displayName || model.name.replace("models/", ""),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)) ?? [];

    return NextResponse.json({ models: generativeModels });
  } catch (e) {
    console.error("Error fetching Google models:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

