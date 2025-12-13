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
  const { searchParams } = new URL(request.url);
  const sha = searchParams.get("sha") ?? "main";

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
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
    console.error(`GitHub tree API error for ${owner}/${repo} (sha: ${sha}):`, res.status, text);
    // Return generic error to client (don't leak sensitive GitHub API details)
    return Response.json(
      { error: "Failed to fetch repository tree" },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    tree?: Array<unknown>;
    truncated?: boolean;
  };

  // Check for tree size limits
  const MAX_TREE_ITEMS = 50_000;
  const treeItems = data.tree ?? [];
  
  if (data.truncated || treeItems.length > MAX_TREE_ITEMS) {
    return Response.json(
      {
        error: "Repository tree too large",
        message: `Tree exceeds maximum size (${MAX_TREE_ITEMS} items). Please use a more specific branch or path.`,
        truncated: data.truncated ?? false,
        itemCount: treeItems.length,
      },
      { status: 422 }
    );
  }

  return Response.json(data);
}
