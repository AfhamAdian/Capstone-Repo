#!/bin/bash

# Clean output colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=================================================="
echo -e "🚀  ${GREEN}Running Capstone Backend System Verification${NC}"
echo "=================================================="

# 1. Check API Express Server health
echo -e "\n--- 1. Testing Express API Health Endpoint ---"
HEALTH_RESP=$(curl -s http://localhost:3000/api/v1/health)

if [[ $HEALTH_RESP == *"status\":\"ok"* ]]; then
  echo -e "${GREEN}✅ API Health is OK!${NC}"
  echo "Payload: $HEALTH_RESP"
else
  echo -e "${RED}❌ API Health check failed or unreachable.${NC}"
  echo "Response: $HEALTH_RESP"
  exit 1
fi

# 2. Query Project from Supabase REST API
echo -e "\n--- 2. Fetching Projects directly from Supabase REST API ---"
SUPABASE_URL="https://vtkvstujcrrytxfxveig.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0a3ZzdHVqY3JyeXR4Znh2ZWlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzNTcwNSwiZXhwIjoyMDkwNzExNzA1fQ.MP4NwjJ6_1G-a764TSgfjwdDU9Tk1s__tmHoHLzXebI"

PROJECTS=$(curl -s -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" "$SUPABASE_URL/rest/v1/project?select=id,name,owner,repo")

if [ -n "$PROJECTS" ] && [[ $PROJECTS != *"error"* ]]; then
  echo -e "${GREEN}✅ Supabase database connection verified!${NC}"
  echo "Available Projects: $PROJECTS"
else
  echo -e "${RED}❌ Failed to fetch projects from Supabase.${NC}"
  echo "Response: $PROJECTS"
  exit 1
fi

# 3. Trigger a Sync Job for Project 1 (Capstone-Repo)
echo -e "\n--- 3. Triggering Sync Job for Project ID 1 (Capstone-Repo) ---"
SYNC_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"projectId":"1","tools":["github"],"sessionId":"test-session-123"}' \
  http://localhost:3000/api/v1/sync)

echo "Queue Response: $SYNC_RESP"

if [[ $SYNC_RESP == *"Sync job queued"* ]]; then
  JOB_ID=$(echo "$SYNC_RESP" | grep -o '"jobId":"[^"]*' | grep -o '[^"]*$')
  echo -e "${GREEN}✅ Sync job enqueued successfully! Job ID: $JOB_ID${NC}"
  
  # 4. Wait and check the Job Status
  echo -e "\n--- 4. Checking Sync Job status after 3 seconds ---"
  sleep 3
  STATUS_RESP=$(curl -s "http://localhost:3000/api/v1/sync/$JOB_ID")
  echo "Status Response: $STATUS_RESP"
else
  echo -e "${RED}❌ Failed to enqueue sync job.${NC}"
fi

echo -e "\n=================================================="
echo -e "${GREEN}Verification complete! Check worker logs using: ${NC}"
echo -e "sudo docker logs capstone-worker"
echo "=================================================="
