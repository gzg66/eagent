#!/usr/bin/env bash
# init.sh - verification entrypoint
# Run before claiming work is done to confirm project health.
set -euo pipefail

echo "=== myagent harness verification ==="

echo "--- npm run build ---"
npm run build

echo "--- npm run check ---"
npm run check

echo "--- ./test.sh ---"
./test.sh

echo "=== verification passed ==="
