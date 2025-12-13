import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { validatePipelineRequest } from "@/lib/pipeline/request";
import { executePipeline } from "@/lib/pipeline";
import type { PipelineProgress } from "@/lib/pipeline/types";
import { checkRateLimit, getRemainingRequests } from "@/lib/rate-limit";

/**
 * Stream pipeline execution with progress updates using Server-Sent Events (SSE).
 * 
 * Note: CSRF protection is provided by NextAuth's built-in session validation.
 * All authenticated routes are automatically protected against CSRF attacks.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Capture token for use in async closure (TypeScript narrowing)
    const accessToken = session.accessToken;

    // Rate limiting: 10 requests per minute per user
    const rateLimitKey = session.user?.email || session.user?.id || "anonymous";
    if (!checkRateLimit(rateLimitKey, 10, 60000)) {
      const remaining = getRemainingRequests(rateLimitKey, 10, 60000);
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Too many pipeline requests. Please try again later.",
          retryAfter: 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Remaining": remaining.toString(),
          },
        }
      );
    }

    const body = await req.json();
    const request = validatePipelineRequest(body);

    // Create a streaming response using Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (progress: PipelineProgress) => {
          const data = JSON.stringify({ type: "progress", data: progress });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const sendError = (error: string) => {
          const data = JSON.stringify({ type: "error", error });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          const result = await executePipeline(
            request,
            accessToken,
            sendProgress
          );

          // Send final result
          const data = JSON.stringify({ type: "result", data: result });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        } catch (error) {
          const err = error as Error;
          console.error("Pipeline run error:", err);
          console.error("Pipeline run error stack:", err.stack);
          sendError(err.message);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error("Pipeline request validation error:", err);
    return NextResponse.json(
      {
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status: 400 }
    );
  }
}


