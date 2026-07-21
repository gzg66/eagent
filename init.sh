#!/usr/bin/env bash
# init.sh — verification entrypoint
# Run before claiming work is done to confirm project health.
set -e

echo "=== myagent harness verification ==="

# 1. Type-check and lint
echo "--- npm run check ---"
npm run check

# 2. Unit tests (non-e2e, no API keys required)
echo "--- ./test.sh ---"
./test.sh

echo "=== verification passed ==="
