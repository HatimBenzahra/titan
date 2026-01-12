#!/bin/bash

echo "========================================="
echo "Titan Agent - Phase 2 Testing"
echo "========================================="
echo ""

API_URL="http://localhost:3000"
API_KEY="dev-key-123"

echo "Test 1: Browser Tool - Read Example.com"
echo "----------------------------------------"
TASK1=$(curl -s -X POST $API_URL/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"goal":"Use the browser tool to open example.com and extract the page title and content"}')

TASK1_ID=$(echo $TASK1 | jq -r '.taskId')
echo "Created task: $TASK1_ID"
echo ""

echo "Waiting for task completion..."
sleep 15

echo ""
echo "Task Result:"
curl -s $API_URL/tasks/$TASK1_ID \
  -H "Authorization: Bearer $API_KEY" | jq '.status, .plan | .[] | select(.tool == "browser") | {description, status, result}'

echo ""
echo ""
echo "========================================="
echo "Test 2: Critic Agent - Intentional Error"
echo "========================================="
echo ""

TASK2=$(curl -s -X POST $API_URL/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"goal":"Create a Python file named test_error.py with invalid syntax (missing closing parenthesis), then try to run it"}')

TASK2_ID=$(echo $TASK2 | jq -r '.taskId')
echo "Created task: $TASK2_ID"
echo ""

echo "Waiting for task completion..."
sleep 20

echo ""
echo "Task Result:"
curl -s $API_URL/tasks/$TASK2_ID \
  -H "Authorization: Bearer $API_KEY" | jq '{status, events: .events | map(select(.type | contains("critic") or contains("correction")))}'

echo ""
echo ""
echo "========================================="
echo "Phase 2 Tests Complete!"
echo "========================================="
