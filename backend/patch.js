const fs = require('fs');
const file = '/home/mahmud1628/Documents/4-1/Capstone-Repo/backend/apps/api/src/database/metrics.ts';
let content = fs.readFileSync(file, 'utf8');

function addRetry(funcName, returnType, replaceStr) {
  return content.replace(replaceStr, 
`async function ${funcName}_impl` + replaceStr.substring(replaceStr.indexOf('(')))
  .replace(`async function ${funcName}_impl`, 
`async function ${funcName}(...args: any[]): Promise<${returnType}> {
  for (let i = 0; i < 3; i++) {
    try {
      return await ${funcName}_impl(...args);
    } catch (e: any) {
      if (i === 2 || !e.message?.includes('fetch failed')) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("Unreachable");
}

async function ${funcName}_impl`);
}

content = addRetry('createProjectSnapshot', 'number', 'async function createProjectSnapshot(projectId: number, snapshotTime: string): Promise<number>');
content = addRetry('insertVersionControlMetrics', 'void', 'async function insertVersionControlMetrics(snapshotId: number, data: GitHubMetricsResponse): Promise<void>');
content = addRetry('insertCodeOwnershipConcentration', 'void', 'async function insertCodeOwnershipConcentration(snapshotId: number, data: GitHubMetricsResponse): Promise<void>');
content = addRetry('insertProjectManagementMetrics', 'void', 'async function insertProjectManagementMetrics(snapshotId: number, data: JiraMetricsResponse): Promise<void>');
content = addRetry('insertLeadTimeTrend', 'void', 'async function insertLeadTimeTrend(snapshotId: number, data: JiraMetricsResponse): Promise<void>');
content = addRetry('insertCicdMetrics', 'void', 'async function insertCicdMetrics(snapshotId: number, data: any): Promise<void>');

fs.writeFileSync(file, content);
content = addRetry('insertCodeQualityMetrics', 'void', 'async function insertCodeQualityMetrics(snapshotId: number, data: SonarQubeMetricsResponse): Promise<void>');
