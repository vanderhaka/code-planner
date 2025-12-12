import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const res = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenAI API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { data: Array<{ id: string; object: string; owned_by: string }> };

    // Filter to chat-compatible GPT models, exclude deprecated and embedding models
    const chatModels = data.data
      .filter(
        (model) =>
          (model.id.startsWith("gpt-4") || model.id.startsWith("gpt-3.5-turbo")) &&
          !model.id.includes("deprecated") &&
          !model.id.includes("embedding") &&
          model.object === "model"
      )
      .map((model) => ({
        id: model.id,
        name: model.id,
      }))
      .sort((a, b) => {
        // Sort GPT-4 models first, then GPT-3.5
        if (a.id.startsWith("gpt-4") && !b.id.startsWith("gpt-4")) return -1;
        if (!a.id.startsWith("gpt-4") && b.id.startsWith("gpt-4")) return 1;
        return a.id.localeCompare(b.id);
      });

    return NextResponse.json({ models: chatModels });
  } catch (e) {
    console.error("Error fetching OpenAI models:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

