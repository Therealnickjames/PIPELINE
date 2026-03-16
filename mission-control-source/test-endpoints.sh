#!/bin/bash
echo "Testing all Mission Control v3 endpoints..."
echo

endpoints=(
  "GET /api/gateway"
  "GET /api/agents" 
  "GET /api/ollama"
  "GET /api/tasks"
  "GET /api/decisions"
  "GET /api/pinned"
  "GET /api/health"
  "GET /api/crons"
  "GET /api/tasks/finished"
  "GET /api/tasks/log"
  "GET /api/hierarchy"
  "POST /api/whiteboard"
)

for endpoint in "${endpoints[@]}"; do
  method=$(echo $endpoint | cut -d' ' -f1)
  path=$(echo $endpoint | cut -d' ' -f2)
  
  if [[ $method == "POST" ]]; then
    # Test POST endpoint with dummy data
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"test": "data"}' "http://localhost:3000${path}")
  else
    # Test GET endpoint
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000${path}")
  fi
  
  echo "$endpoint: HTTP $code"
done
echo
echo "Test complete."
