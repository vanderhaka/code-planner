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

    // Filter to GPT-5 series CHAT models only
    // Only include models with "chat", "pro", or "mini" - these are verified chat-compatible
    // Exclude codex models (code completion, not chat)
    const chatModels = data.data
      .filter(
        (model) =>
          model.id.startsWith("gpt-5") &&
          !model.id.includes("deprecated") &&
          !model.id.includes("codex") &&
          model.object === "model" &&
          (model.id.includes("chat") || model.id.includes("pro") || model.id.includes("mini"))
      )
      .map((model) => ({
        id: model.id,
        name: model.id,
      }))
      .sort((a, b) => {
        // Prioritize chat-latest models, then pro, then mini
        const aScore = a.id.includes("chat-latest") ? 0 : a.id.includes("pro") ? 1 : 2;
        const bScore = b.id.includes("chat-latest") ? 0 : b.id.includes("pro") ? 1 : 2;
        if (aScore !== bScore) return aScore - bScore;
        return b.id.localeCompare(a.id); // Newer versions first
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

