import { assertSupabaseClient } from './config/supabase.js';

async function main() {
  const client = assertSupabaseClient();

  const { data: before, error: beforeErr } = await client
    .from('projecttoolintegration')
    .select('id, project_id, tool_category, tool_name')
    .in('id', [1, 2]);
  if (beforeErr) throw new Error(beforeErr.message);
  console.log('before:', before);

  const { error: e1 } = await client
    .from('projecttoolintegration')
    .update({ tool_category: 'vcs' })
    .eq('id', 1)
    .eq('tool_category', 'version_control');
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await client
    .from('projecttoolintegration')
    .update({ tool_category: 'projectManagement' })
    .eq('id', 2)
    .eq('tool_category', 'project_management');
  if (e2) throw new Error(e2.message);

  const { data: after, error: afterErr } = await client
    .from('projecttoolintegration')
    .select('id, project_id, tool_category, tool_name')
    .in('id', [1, 2]);
  if (afterErr) throw new Error(afterErr.message);
  console.log('after:', after);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
