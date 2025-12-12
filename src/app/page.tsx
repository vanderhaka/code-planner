import { AuthButtons } from "@/components/auth-buttons";
import { RepoList } from "@/components/repo-list";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Code Planner</h1>
        <AuthButtons />
      </header>

      <p className="mt-4 text-sm text-neutral-600">
        Connect GitHub to enable private-repo file access for reviews.
      </p>

      <RepoList />
    </main>
  );
}
