import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          // Note: 'repo' scope is required for private repository access.
          // To reduce scope to read-only, we would need to use GitHub fine-grained tokens
          // with 'Contents: Read-only' permission, which requires app-level configuration.
          // For now, 'repo' is necessary to support both public and private repos.
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (typeof account?.access_token === "string") {
        token.accessToken = account.access_token;
      }
      if (account?.provider) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.provider =
        typeof token.provider === "string" ? token.provider : undefined;
      return session;
    },
  },
});
