import { createVcsStrategy } from '../dist/utils/vcs/index.js';
import 'dotenv/config';
import type { GitHubMetricsResponse } from '../dist/utils/vcs/github-metrics.types.js';

/**
 * Test script for GitHub metrics calculation
 * 
 * Usage:
 *   GITHUB_TOKEN=your_token GITHUB_OWNER=owner GITHUB_REPO=repo npx ts-node scripts/test-github-metrics.ts
 * 
 * Or with tsx:
 *   GITHUB_TOKEN=your_token GITHUB_OWNER=owner GITHUB_REPO=repo npx tsx scripts/test-github-metrics.ts
 * 
 * Example:
 *   GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=microsoft GITHUB_REPO=vscode npx tsx scripts/test-github-metrics.ts
 */

async function testGitHubMetrics() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();

  const printUsage = () => {
    console.error('\nUsage:');
    console.error('  GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=<owner> GITHUB_REPO=<repo> npm run test:github-metrics');
    console.error('\nOr set them in a .env file in backend/:');
    console.error('  GITHUB_TOKEN=ghp_xxx');
    console.error('  GITHUB_OWNER=microsoft');
    console.error('  GITHUB_REPO=vscode\n');
  };

  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is required');
    printUsage();
    process.exit(1);
  }

  if (!owner) {
    console.error('❌ Error: GITHUB_OWNER environment variable is required');
    printUsage();
    process.exit(1);
  }

  if (!repo) {
    console.error('❌ Error: GITHUB_REPO environment variable is required');
    printUsage();
    process.exit(1);
  }

  console.log('🔧 Testing GitHub Metrics Calculation');
  console.log(`📦 Repository: ${owner}/${repo}`);
  console.log('⏱️  Starting metrics calculation...\n');

  const fmt = (value: number | null | undefined, digits = 2): string => {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
  };

  try {
    const strategy = createVcsStrategy({
      provider: 'github',
      credentials: {
        token,
      },
      project: {
        owner,
        repo,
      },
    });

    const startTime = Date.now();
    const metrics = (await strategy.getData()) as GitHubMetricsResponse;
    const endTime = Date.now();

    console.log('✅ Metrics calculated successfully!\n');
    console.log(`⏱️  Total time: ${((endTime - startTime) / 1000).toFixed(2)}s\n`);

    // Pretty print the results
    console.log('📊 METRICS RESULTS:');
    console.log('='.repeat(60));

    const m = metrics.metrics;

    console.log('\n📋 ISSUES:');
    console.log(`  • Closed per week: ${m.issuesClosedPerWeek}`);
    console.log(`  • Avg cycle time: ${fmt(m.issueCycleTimeAvgDays)} days`);

    console.log('\n💻 CODE QUALITY:');
    console.log(`  • Files modified 10+ times: ${m.codeChurn.filesModifiedGte10Times}`);
    console.log(`  • Files modified by 3+ people: ${m.codeChurn.filesModifiedByGte3People}`);
    console.log(`  • Commit message quality:`);
    console.log(`    - Issue references: ${fmt(m.commitMessageQuality.withIssueRefPercent)}%`);
    console.log(`    - Has body: ${fmt(m.commitMessageQuality.withBodyPercent)}%`);
    console.log(`    - Conventional format: ${fmt(m.commitMessageQuality.followingConventionPercent)}%`);

    console.log('\n🔍 PULL REQUESTS:');
    console.log(`  • Review coverage: ${fmt(m.prReviewCoveragePercent)}%`);
    console.log(`  • Reviews per PR: ${fmt(m.reviewPerPrAvg)}`);
    console.log(`  • Time to first review: ${fmt(m.timeToFirstReviewAvgHours)} hours`);
    console.log(`  • Stale PRs (>14 days): ${m.stalePrCount}`);
    console.log(`  • Revert rate: ${fmt(m.prRevertRatePercent)}%`);
    console.log(`  • Self-merged rate: ${fmt(m.selfMergedPrRatePercent)}%`);

    console.log('\n👥 TEAM & CONTRIBUTORS:');
    console.log(`  • Active contributions per week: ${m.activeContributionsPerWeek}`);
    console.log(`  • Bus factor: ${fmt(m.busFactor)} contributors to 50%`);
    if (m.codeOwnershipConcentration?.directories?.length) {
      console.log(`  • Top directories breakdown:`);
      m.codeOwnershipConcentration.directories.slice(0, 5).forEach((dirStat) => {
        console.log(
          `    - ${dirStat.path}: top contributor ${fmt(dirStat.topContributorPercent)}%${dirStat.isFlagged ? ' (flagged)' : ''}`,
        );
      });
    }

    console.log('\n🌳 BRANCHES & REPOSITORY:');
    console.log(`  • Long-lived branches (>30 days): ${m.longLivedBranchesCount}`);
    console.log(`  • Review network density: ${fmt(m.reviewNetworkDensity)}`);
    console.log(`  • Dependency update lag: ${m.dependencyUpdateLagAvgDays ?? 'N/A (requires external package registry)'}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n📁 Full metrics object (JSON):\n');
    console.log(JSON.stringify(metrics, null, 2));

  } catch (error) {
    console.error('❌ Error calculating metrics:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.message.includes('401')) {
        console.error('\n💡 Tip: Check that your GITHUB_TOKEN is valid and has not expired');
      }
      if (error.message.includes('404')) {
        console.error('\n💡 Tip: Check that the repository owner and name are correct');
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

testGitHubMetrics();
