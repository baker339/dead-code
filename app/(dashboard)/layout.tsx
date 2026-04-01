import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SiteLogo } from "@/components/site-logo";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 px-3 py-4">
        <Link
          href="/dashboard"
          className="rounded-md px-2 py-1.5 text-zinc-800 hover:bg-zinc-200/80"
        >
          <SiteLogo
            size={36}
            wordmarkClassName="text-sm font-semibold tracking-tight text-zinc-900"
          />
        </Link>
        <nav className="mt-6 flex flex-col gap-1 text-base">
          <Link
            href="/dashboard"
            className="rounded-md px-2 py-1.5 text-zinc-800 hover:bg-zinc-200/80"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/files"
            className="rounded-md px-2 py-1.5 text-zinc-800 hover:bg-zinc-200/80"
          >
            Files
          </Link>
          <Link
            href="/dashboard/graph"
            className="rounded-md px-2 py-1.5 text-zinc-800 hover:bg-zinc-200/80"
          >
            Code graph
          </Link>
          <Link
            href="/dashboard/settings"
            className="rounded-md px-2 py-1.5 text-zinc-800 hover:bg-zinc-200/80"
          >
            Settings
          </Link>
        </nav>
        <div className="mt-auto border-t border-zinc-200 pt-4">
          <p className="truncate px-2 text-sm text-zinc-600">
            {session.user.email ?? session.user.name ?? "Signed in"}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
            className="mt-2"
          >
            <button
              type="submit"
              className="w-full rounded-md px-2 py-1.5 text-left text-base text-zinc-600 hover:bg-zinc-200/80"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-white p-8">{children}</main>
    </div>
  );
}
