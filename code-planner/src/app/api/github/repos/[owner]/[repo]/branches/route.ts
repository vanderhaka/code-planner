import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo } = await params;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    // Log full error server-side for debugging
    console.error(`GitHub branches API error for ${owner}/${repo}:`, res.status, text);
    // Return generic error to client (don't leak sensitive GitHub API details)
    return Response.json(
      { error: "Failed to fetch repository branches" },
      { status: 502 },
    );
  }

  const data = (await res.json()) as unknown;
  return Response.json(data);
}
