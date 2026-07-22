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
  # Unset API keys (see packages/ai/src/env-api-keys.ts)
  unset ANTHROPIC_API_KEY
  unset ANTHROPIC_OAUTH_TOKEN
  unset OPENAI_API_KEY
  unset GEMINI_API_KEY
  unset GROQ_API_KEY
  unset CEREBRAS_API_KEY
  unset XAI_API_KEY
  unset OPENROUTER_API_KEY
  unset ZAI_API_KEY
  unset MISTRAL_API_KEY
  unset MINIMAX_API_KEY
  unset MINIMAX_CN_API_KEY
  unset AI_GATEWAY_API_KEY
  unset OPENCODE_API_KEY
  unset COPILOT_GITHUB_TOKEN
  unset GH_TOKEN
  unset GITHUB_TOKEN
  unset HF_TOKEN
  unset GOOGLE_APPLICATION_CREDENTIALS
  unset GOOGLE_CLOUD_PROJECT
  unset GCLOUD_PROJECT
  unset GOOGLE_CLOUD_LOCATION
  unset AWS_PROFILE
  unset AWS_ACCESS_KEY_ID
  unset AWS_SECRET_ACCESS_KEY
  unset AWS_SESSION_TOKEN
  unset AWS_REGION
  unset AWS_DEFAULT_REGION
  unset AWS_BEARER_TOKEN_BEDROCK
  unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  unset AWS_CONTAINER_CREDENTIALS_FULL_URI
  unset AWS_WEB_IDENTITY_TOKEN_FILE
  unset AZURE_OPENAI_API_KEY
  unset AZURE_OPENAI_BASE_URL
  unset AZURE_OPENAI_RESOURCE_NAME
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
