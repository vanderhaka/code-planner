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

    // Filter to GPT-5 series CHAT models only.
    // OpenAI's /v1/models includes many non-chat models; our app uses /v1/chat/completions.
    // To avoid "This is not a chat model" errors, only include explicit chat models.
    const chatModels = data.data
      .filter(
        (model) =>
          model.id.startsWith("gpt-5") &&
          model.object === "model" &&
          !model.id.includes("deprecated") &&
          model.id.includes("chat")
      )
      .map((model) => ({
        id: model.id,
        name: model.id,
      }))
      .sort((a, b) => {
        // Prioritize chat-latest models
        const aScore = a.id.includes("chat-latest") ? 0 : 1;
        const bScore = b.id.includes("chat-latest") ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
        return b.id.localeCompare(a.id); // Newer/lexicographically later first
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

