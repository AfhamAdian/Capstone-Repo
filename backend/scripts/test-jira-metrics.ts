import 'dotenv/config';
import { createPmConnector, type JiraMetricsResponse } from '@libs/connectors/pm/index.js';

/**
 * Test script for Jira metrics calculation
 *
 * Usage:
 *   JIRA_TOKEN=your_token JIRA_EMAIL=your_email JIRA_BASE_URL=https://your-domain.atlassian.net JIRA_PROJECT_KEY=PROJ npm run test:jira-metrics
 *
 * Or with tsx:
 *   JIRA_TOKEN=your_token JIRA_EMAIL=your_email JIRA_BASE_URL=https://your-domain.atlassian.net JIRA_PROJECT_KEY=PROJ npx tsx scripts/test-jira-metrics.ts
 *
 * Example:
 *   JIRA_TOKEN=xxx JIRA_EMAIL=user@example.com JIRA_BASE_URL=https://mycompany.atlassian.net JIRA_PROJECT_KEY=PROJ JIRA_BOARD_ID=123 npx tsx scripts/test-jira-metrics.ts
 */

async function testJiraMetrics() {
  const token = process.env.JIRA_TOKEN?.trim();
  const email = process.env.JIRA_EMAIL?.trim();
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const projectKey = process.env.JIRA_PROJECT_KEY?.trim();
  const boardId = process.env.JIRA_BOARD_ID?.trim();

  const printUsage = () => {
    console.error('\nUsage:');
    console.error(
      '  JIRA_TOKEN=xxx JIRA_EMAIL=user@example.com JIRA_BASE_URL=https://your-domain.atlassian.net JIRA_PROJECT_KEY=PROJ npm run test:jira-metrics',
    );
    console.error('\nOr set them in a .env file in backend/:');
    console.error('  JIRA_TOKEN=xxx');
    console.error('  JIRA_EMAIL=user@example.com');
    console.error('  JIRA_BASE_URL=https://your-domain.atlassian.net');
    console.error('  JIRA_PROJECT_KEY=PROJ');
    console.error('  JIRA_BOARD_ID=123 (optional, for sprint metrics)\n');
  };

  if (!token) {
    console.error('❌ Error: JIRA_TOKEN environment variable is required');
    printUsage();
    process.exit(1);
  }

  if (!email) {
    console.error('❌ Error: JIRA_EMAIL environment variable is required');
    printUsage();
    process.exit(1);
  }

  if (!baseUrl) {
    console.error('❌ Error: JIRA_BASE_URL environment variable is required');
    printUsage();
    process.exit(1);
  }

  if (!projectKey) {
    console.error('❌ Error: JIRA_PROJECT_KEY environment variable is required');
    printUsage();
    process.exit(1);
  }

  console.log('🔧 Testing Jira Metrics Calculation');
  console.log(`📦 Project: ${projectKey}`);
  console.log(`🌐 Base URL: ${baseUrl}`);
  if (boardId) {
    console.log(`📊 Board ID: ${boardId}`);
  }
  console.log('⏱️  Starting metrics calculation...\n');

  const fmt = (value: number | null | undefined, digits = 2): string => {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
  };

  try {
    const connector = createPmConnector({
      provider: 'jira',
      credentials: {
        token,
        email,
        baseUrl,
      },
      project: {
        projectKey,
        boardId,
      },
    });

    const startTime = Date.now();
  const metrics = (await connector.getData()) as JiraMetricsResponse;
    const endTime = Date.now();

    console.log('✅ Metrics calculated successfully!\n');
    console.log(`⏱️  Total time: ${((endTime - startTime) / 1000).toFixed(2)}s\n`);

    // Pretty print the results
    console.log('📊 JIRA METRICS RESULTS:');
    console.log('='.repeat(60));

    const m = metrics.metrics;

    console.log('\n📦 PROJECT INFO:');
    console.log(`  • Key: ${metrics.project.key}`);
    console.log(`  • ID: ${metrics.project.id}`);
    console.log(`  • Name: ${metrics.project.name}`);

    console.log('\n🚀 DELIVERY VELOCITY:');
    console.log(`  • Sprint completion rate: ${fmt(m.sprintCompletionRate)}%`);
    console.log(`  • Issue cycle time: ${fmt(m.issueCycleTimeAvgDays)} days`);
    console.log(`  • Throughput per week: ${m.throughputPerWeek} issues`);
    console.log(`  • Carryover rate: ${fmt(m.carryoverRate)}%`);
    console.log(`  • Scope creep rate: ${fmt(m.scopeCreepRate)}%`);
    console.log(`  • Estimation accuracy: ${fmt(m.estimationAccuracy)}%`);
    console.log(`  • Blocked items: ${m.blockedItemsCount} (avg age: ${fmt(m.blockedItemsAvgAgeDays)} days)`);
    console.log(`  • Overdue items: ${m.overdueItemsCount}`);

    console.log('\n⏱️  LEAD TIME METRICS:');
    console.log(`  • Average: ${fmt(m.leadTime.avgDays)} days`);
    console.log(`  • Median: ${fmt(m.leadTime.medianDays)} days`);
    console.log(`  • 95th percentile: ${fmt(m.leadTime.p95Days)} days`);
    console.log(`  • Variance: ${fmt(m.leadTime.variance)}`);
    if (m.leadTime.trendAcrossSprints.length > 0) {
      console.log(`  • Trend across sprints:`);
      m.leadTime.trendAcrossSprints.forEach((trend) => {
        console.log(`    - ${trend.sprintName}: ${fmt(trend.avgLeadTimeDays)} days`);
      });
    }

    console.log('\n🔄 SPRINT SPILLOVER:');
    console.log(`  • Spillover ratio: ${fmt(m.spillover.spilloverRatio)}%`);
    console.log(`  • Story point spillover: ${fmt(m.spillover.storyPointSpillover)}`);
    console.log(`  • Consecutive spillover count: ${m.spillover.consecutiveSpilloverCount}`);
    console.log(`  • Carryover avg age: ${fmt(m.spillover.carryoverAvgAgeDays)} days`);

    console.log('\n🚧 BLOCKED WORK:');
    console.log(`  • Blocked ticket %: ${fmt(m.blockedWork.blockedTicketPercent)}%`);
    console.log(`  • Avg blocked duration: ${fmt(m.blockedWork.avgBlockedDurationDays)} days`);
    console.log(`  • Max blocked duration: ${fmt(m.blockedWork.maxBlockedDurationDays)} days`);
    console.log(`  • Blocked re-entry count: ${m.blockedWork.blockedReentryCount}`);

    console.log('\n📈 SCOPE CHURN:');
    console.log(`  • Mid-sprint additions: ${m.scopeChurn.midSprintAdditions}`);
    console.log(`  • Scope churn ratio: ${fmt(m.scopeChurn.scopeChurnRatio)}%`);
    console.log(`  • Priority change count: ${m.scopeChurn.priorityChangeCount}`);
    console.log(`  • Removed scope ratio: ${fmt(m.scopeChurn.removedScopeRatio)}%`);

    console.log('\n⏳ STALE TICKETS:');
    console.log(`  • In-progress avg age: ${fmt(m.staleTickets.inProgressAvgAgeDays)} days`);
    console.log(`  • Stale ticket ratio: ${fmt(m.staleTickets.staleTicketRatio)}%`);
    console.log(`  • State movement count: ${m.staleTickets.stateMovementCount}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n📁 Full metrics object (JSON):\n');
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error('❌ Error calculating metrics:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.error('\n💡 Tip: Check that your JIRA_TOKEN and JIRA_EMAIL are correct');
      }
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        console.error('\n💡 Tip: Check that the project key and base URL are correct');
      }
      if (error.message.includes('403') || error.message.includes('Forbidden')) {
        console.error('\n💡 Tip: Check that your Jira token has the required permissions');
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

testJiraMetrics();
