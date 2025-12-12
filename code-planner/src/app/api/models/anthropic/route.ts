import { NextResponse } from "next/server";

export async function GET() {
  // Anthropic doesn't have a models list API, so we return a hardcoded list
  // of current Claude models (updated December 2025)
  const models = [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  ];

  return NextResponse.json({ models });
}

