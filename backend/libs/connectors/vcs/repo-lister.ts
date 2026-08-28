// Lists the repositories a VCS access token can reach under a given org/owner.
// Powers the workspace "Load Projects" step: the user pastes a PAT, we show the repos it can access,
// and they pick which to track. GitHub is implemented; GitLab/Bitbucket land in a later pass.

import { Octokit } from '@octokit/rest';

export interface RepoSummary {
  name: string; // repo name, e.g. "Quiz_Application"
  fullName: string; // "owner/repo"
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string | null;
  private: boolean;
}

// Thrown for expected failures (bad token, unsupported provider) so callers can map to a 4xx.
export class VcsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'VcsError';
  }
}

export async function listAccessibleRepos(
  vcs: string,
  organization: string,
  token: string,
): Promise<RepoSummary[]> {
  if (!token?.trim()) throw new VcsError('An access token is required', 400);
  if (!organization?.trim()) throw new VcsError('An organization/owner is required', 400);

  switch (vcs) {
    case 'github':
      return listGithubRepos(organization.trim(), token.trim());
    case 'gitlab':
    case 'bitbucket':
      throw new VcsError(`${vcs} repo listing is not supported yet`, 400);
    default:
      throw new VcsError(`Unknown version control provider: ${vcs}`, 400);
  }
}

async function listGithubRepos(organization: string, token: string): Promise<RepoSummary[]> {
  const octokit = new Octokit({ auth: token });

  let repos: Array<Record<string, unknown>>;
  try {
    // Every repo the token can reach; we then narrow to the requested org/owner.
    repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 100,
      affiliation: 'owner,collaborator,organization_member',
      sort: 'updated',
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) throw new VcsError('Invalid or expired access token', 401);
    if (status === 403) throw new VcsError('Token lacks the required permissions, or the rate limit was hit', 403);
    throw new VcsError('Failed to reach GitHub with the provided token', 502);
  }

  const org = organization.toLowerCase();
  return repos
    .filter((r) => String((r.owner as { login?: string })?.login ?? '').toLowerCase() === org)
    .map((r) => ({
      name: r.name as string,
      fullName: r.full_name as string,
      description: (r.description as string) ?? null,
      language: (r.language as string) ?? null,
      stars: (r.stargazers_count as number) ?? 0,
      updatedAt: (r.updated_at as string) ?? (r.pushed_at as string) ?? null,
      private: Boolean(r.private),
    }));
}
