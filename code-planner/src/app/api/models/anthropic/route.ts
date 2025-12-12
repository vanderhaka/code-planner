import { NextResponse } from "next/server";

export async function GET() {
  // Anthropic doesn't have a models list API, so we return a hardcoded list
  // of current Claude models
  const models = [
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
    { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
  ];

  return NextResponse.json({ models });
}

