import { signIn } from "@/auth";
import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center text-center">
        <h1>
          <SiteLogo
            size={56}
            wordmarkClassName="text-2xl font-semibold tracking-tight text-zinc-900"
          />
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Sign in with GitHub to connect a repository for analysis.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Continue with GitHub
        </button>
      </form>
      <Link
        href="/"
        className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
