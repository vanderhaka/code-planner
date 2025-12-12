import { auth } from "@/auth";

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated",
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
