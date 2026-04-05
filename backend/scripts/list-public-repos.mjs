import { Octokit } from "@octokit/rest";

const username = 'AfhamAdian';
const token = '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';

if (!username) {
  console.error("Usage: node scripts/list-public-repos.mjs <github-username>");
  console.error("Or set GITHUB_USERNAME in environment variables.");
  process.exit(1);
}

const octokit = new Octokit(token ? { auth: token } : {});

try {
  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username,
    type: "public",
    per_page: 100,
  });

  const names = repos.map((repo) => repo.name);
  console.log(JSON.stringify(names, null, 2));
} catch (error) {
  console.error("Failed to fetch repositories:", error.message);
  process.exit(1);
}
