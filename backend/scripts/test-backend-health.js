import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

async function runTests() {
  console.log('==================================================');
  console.log('🔍 Testing Backend & Database Integrations...');
  console.log('==================================================\n');

  // 1. Check API Express Server health
  console.log('--- 1. Testing Express API Health Endpoint ---');
  try {
    const response = await fetch('http://localhost:3000/api/v1/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Express API server is reachable!');
      console.log('Health Status Payload:', JSON.stringify(data, null, 2));
    } else {
      console.error(`❌ Express API health endpoint returned status ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Failed to connect to API Health endpoint:', error.message);
    console.log('Make sure your API container is running (sudo docker ps).');
  }

  console.log('\n--- 2. Fetching Project List & Integrations from Supabase ---');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in .env');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: projects, error } = await supabase
      .from('project')
      .select('id, name, owner, repo, jira_project_key, created_at');

    if (error) {
      throw error;
    }

    console.log('✅ Supabase connected successfully!');
    if (!projects || projects.length === 0) {
      console.log('⚠️ No projects found in the "project" table.');
    } else {
      console.log(`🎉 Found ${projects.length} project(s) in the database:\n`);
      console.table(projects);
    }
  } catch (error) {
    console.error('❌ Database connection/query failed:', error.message);
  }
}

runTests();
