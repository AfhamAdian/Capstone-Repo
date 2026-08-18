import { assertSupabaseClient } from './apps/api/src/config/supabase.js';
const c = assertSupabaseClient();
const { data: snaps } = await c.from('projectsnapshot').select('id,snapshot_time').eq('project_id',22).order('id',{ascending:false}).limit(3);
console.log('project 22 snapshots:', snaps?.map(s=>s.id));
for (const s of snaps ?? []) {
  const { data: rs } = await c.from('riskscore').select('*').eq('project_snapshot_id', s.id);
  if (rs?.length) { console.log(`  snapshot ${s.id} riskscore:`, JSON.stringify(rs[0])); }
}
