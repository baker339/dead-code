import Link from "next/link";
import { auth } from "@/auth";
import { SiteLogo } from "@/components/site-logo";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-24">
      <div className="max-w-lg text-center">
        <h1 className="flex justify-center">
          <SiteLogo
            size={72}
            wordmarkClassName="text-3xl font-semibold tracking-tight text-zinc-900"
          />
        </h1>
        <p className="mt-3 text-zinc-600">
          Analyze a repository for tech debt using git history and unused or
          low-signal code.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {session ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Open dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign in with GitHub
          </Link>
        )}
      </div>
    </div>
  );
}
