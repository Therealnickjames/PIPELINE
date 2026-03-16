#!/bin/bash

# Mission Control v3 - Complete API Test Suite
# Tests all 12 endpoints (8 v2 + 4 v3)

BASE_URL="http://localhost:3000/api"
PASSED=0
FAILED=0

echo "Mission Control v3 API Test Suite"
echo "=================================="

# Test function
test_endpoint() {
    local endpoint="$1"
    local expected_field="$2"
    local method="${3:-GET}"
    
    echo -n "Testing $method $endpoint... "
    
    if [[ "$method" == "GET" ]]; then
        response=$(curl -s "$BASE_URL$endpoint")
    else
        response=$(curl -s -X "$method" "$BASE_URL$endpoint")
    fi
    
    if [[ $? -ne 0 ]]; then
        echo "FAIL (connection error)"
        ((FAILED++))
        return
    fi
    
    # Check for valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        echo "FAIL (invalid JSON)"
        echo "Response: $response"
        ((FAILED++))
        return
    fi
    
    # Check for expected field or timestamp (all responses should have timestamp)
    if [[ -n "$expected_field" ]]; then
        if echo "$response" | jq -e ".$expected_field" >/dev/null 2>&1; then
            echo "PASS"
            ((PASSED++))
        else
            echo "FAIL (missing $expected_field)"
            echo "Response: $response"
            ((FAILED++))
        fi
    else
        # For POST endpoints, check for error structure
        if echo "$response" | jq -e ".error" >/dev/null 2>&1; then
            echo "PASS (expected error)"
            ((PASSED++))
        else
            echo "FAIL (unexpected response)"
            echo "Response: $response"
            ((FAILED++))
        fi
    fi
}

echo
echo "v2 Endpoints (8):"
echo "-----------------"

test_endpoint "/gateway" "port"
test_endpoint "/agents" "[0].id"
test_endpoint "/ollama" "status"
test_endpoint "/tasks" "plans"
test_endpoint "/decisions" "decisions"
test_endpoint "/pinned" "items"
test_endpoint "/health" "lastLog"
test_endpoint "/crons" "jobs"

echo
echo "v3 New Endpoints (4):"
echo "---------------------"

test_endpoint "/tasks/finished" "tasks"
test_endpoint "/tasks/log" "entries"
test_endpoint "/hierarchy" "nodes"
test_endpoint "/whiteboard" "" "POST"

echo
echo "Results:"
echo "========"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total:  $((PASSED + FAILED))"

if [[ $FAILED -eq 0 ]]; then
    echo "✅ All endpoints working!"
    exit 0
else
    echo "❌ Some endpoints failed"
    exit 1
fi