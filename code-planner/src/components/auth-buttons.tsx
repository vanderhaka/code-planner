"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButtons() {
  const { status } = useSession();

  if (status === "loading") return null;

  if (status === "authenticated") {
    return (
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="btn"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("github")}
      className="btn btn-primary"
    >
      Connect GitHub
    </button>
  );
}
