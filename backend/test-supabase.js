import { createClient } from '@supabase/supabase-js';
const client = createClient(
  'https://vtkvstujcrrytxfxveig.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0a3ZzdHVqY3JyeXR4Znh2ZWlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzNTcwNSwiZXhwIjoyMDkwNzExNzA1fQ.MP4NwjJ6_1G-a764TSgfjwdDU9Tk1s__tmHoHLzXebI'
);
client.from('nonexistent_table').insert([{ test: 1 }]).then(res => console.log(res));
