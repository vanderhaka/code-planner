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

    // Filter to GPT-5 series models only
    const chatModels = data.data
      .filter(
        (model) =>
          model.id.startsWith("gpt-5") &&
          !model.id.includes("deprecated") &&
          model.object === "model"
      )
      .map((model) => ({
        id: model.id,
        name: model.id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models: chatModels });
  } catch (e) {
    console.error("Error fetching OpenAI models:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

