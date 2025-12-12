import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> },
) {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo, path } = await params;
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref") ?? "main";
  const filePath = path.join("/");

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
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
    return Response.json(
      { error: "GitHub request failed", status: res.status, body: text },
      { status: 502 },
    );
  }

  const data = (await res.json()) as unknown;
  return Response.json(data);
}
