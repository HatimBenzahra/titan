#!/bin/bash

echo "🧪 Titan Agent - Quick Test"
echo "=========================="
echo ""

# Check if server is running
echo "1. Checking if server is running..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Server is running on port 3000"
else
    echo "   ❌ Server is not running!"
    echo "   Start with: npm run start:dev"
    exit 1
fi

# Create a test task
echo ""
echo "2. Creating a test task..."
TASK_ID=$(curl -s -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-123" \
  -d '{"goal":"Write Hello World to a file named test.txt"}' | jq -r '.taskId')

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
    echo "   ❌ Failed to create task"
    exit 1
fi

echo "   ✅ Task created: $TASK_ID"

# Wait and monitor task
echo ""
echo "3. Monitoring task execution..."
for i in {1..30}; do
    sleep 2

    RESPONSE=$(curl -s http://localhost:3000/tasks/$TASK_ID \
        -H "Authorization: Bearer dev-key-123")

    STATUS=$(echo $RESPONSE | jq -r '.status')
    EVENTS=$(echo $RESPONSE | jq '.events | length')
    PLAN=$(echo $RESPONSE | jq '.plan | length')

    echo "   [$i/30] Status: $STATUS | Events: $EVENTS | Plan steps: $PLAN"

    if [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ]; then
        break
    fi
done

# Show results
echo ""
echo "4. Task Results:"
echo "   Status: $STATUS"

if [ "$PLAN" != "0" ] && [ "$PLAN" != "null" ]; then
    echo ""
    echo "   📋 Plan:"
    echo $RESPONSE | jq '.plan[] | "      - \(.description) [\(.status)]"' -r
fi

echo ""
echo "   📊 Events:"
echo $RESPONSE | jq '.events[] | "      \(.type)"' -r | head -10

if [ "$STATUS" = "succeeded" ]; then
    echo ""
    echo "✅ TEST PASSED! The system is working!"
elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "⚠️  Task failed - checking error..."
    ERROR=$(echo $RESPONSE | jq -r '.events[] | select(.type=="orchestration_failed" or .type=="task_failed") | .data.error' | head -1)
    echo "   Error: $ERROR"
else
    echo ""
    echo "⏱️  Task still running..."
fi

echo ""
echo "🔍 View full task details:"
echo "   curl -s http://localhost:3000/tasks/$TASK_ID -H \"Authorization: Bearer dev-key-123\" | jq"
