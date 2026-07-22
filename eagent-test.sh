#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IS_WSL=false
if [[ -r /proc/sys/kernel/osrelease ]] && grep -qi microsoft /proc/sys/kernel/osrelease; then
  IS_WSL=true
fi

# Check for --no-env flag
NO_ENV=false
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--no-env" ]]; then
    NO_ENV=true
  else
    ARGS+=("$arg")
  fi
done

if [[ "$NO_ENV" == "true" ]]; then
  unset LITELLM_API_KEY
  echo "Running without API keys..."
fi

if [[ "$IS_WSL" == "true" ]]; then
  WSL_NODE="$(command -v node 2>/dev/null || bash -lc 'command -v node' 2>/dev/null || true)"
  if [[ -z "$WSL_NODE" || ! -x "$WSL_NODE" ]]; then
    echo "Error: a WSL Node.js installation was not found." >&2
    exit 1
  fi
  # The repository uses erasable TypeScript, so Node can run the source without a platform-specific tsx/esbuild binary.
  "$WSL_NODE" \
    --experimental-strip-types \
    "$SCRIPT_DIR/packages/coding-agent/src/cli.ts" \
    ${ARGS[@]+"${ARGS[@]}"}
else
  # Non-login shells may omit the user's Node installation from PATH.
  if ! command -v node >/dev/null 2>&1; then
    LOGIN_NODE="$(bash -lc 'command -v node' 2>/dev/null || true)"
    if [[ -n "$LOGIN_NODE" && -x "$LOGIN_NODE" ]]; then
      export PATH="$(dirname "$LOGIN_NODE"):$PATH"
    fi
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node was not found in PATH or the login shell." >&2
    exit 1
  fi
  "$SCRIPT_DIR/node_modules/.bin/tsx" \
    --tsconfig "$SCRIPT_DIR/tsconfig.json" \
    "$SCRIPT_DIR/packages/coding-agent/src/cli.ts" \
    ${ARGS[@]+"${ARGS[@]}"}
fi
