import { Octokit } from "octokit";
import { prisma } from "@/lib/db";

export async function getGithubAccessToken(
  userId: string,
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}

export async function getOctokitForUser(
  userId: string,
): Promise<Octokit | null> {
  const token = await getGithubAccessToken(userId);
  if (!token) return null;
  return new Octokit({ auth: token });
}

export type GithubRepoSummary = {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export async function listGithubReposForUser(
  userId: string,
): Promise<GithubRepoSummary[] | null> {
  const octokit = await getOctokitForUser(userId);
  if (!octokit) return null;

  const out: GithubRepoSummary[] = [];
  const iterator = octokit.paginate.iterator(
    octokit.rest.repos.listForAuthenticatedUser,
    {
      per_page: 100,
      affiliation: "owner,collaborator,organization_member",
      visibility: "all",
      sort: "updated",
    },
  );

  for await (const { data } of iterator) {
    for (const r of data) {
      out.push({
        id: r.id,
        fullName: r.full_name,
        defaultBranch: r.default_branch ?? "main",
        private: r.private,
      });
      if (out.length >= 200) return out;
    }
  }

  return out;
}

export async function fetchRepoForUser(
  octokit: Octokit,
  fullName: string,
): Promise<{
  id: number;
  full_name: string;
  default_branch: string | null;
}> {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository name (expected owner/name).");
  }

  const { data } = await octokit.rest.repos.get({ owner, repo });
  return {
    id: data.id,
    full_name: data.full_name,
    default_branch: data.default_branch,
  };
}
