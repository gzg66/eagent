#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IS_WSL=false
if [[ -r /proc/sys/kernel/osrelease ]] && grep -qi microsoft /proc/sys/kernel/osrelease; then
  IS_WSL=true
fi

# Parse arguments
CLIENT_ONLY=false
SERVER_ONLY=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --client-only) CLIENT_ONLY=true ;;
    --server-only) SERVER_ONLY=true ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [[ "$IS_WSL" == "true" ]]; then
  WSL_NODE="$(command -v node 2>/dev/null || bash -lc 'command -v node' 2>/dev/null || true)"
  if [[ -z "$WSL_NODE" || ! -x "$WSL_NODE" ]]; then
    echo "Error: a WSL Node.js installation was not found." >&2
    exit 1
  fi

  if [[ "$CLIENT_ONLY" != "true" ]]; then
    # Prefer pre-built JS; fall back to --experimental-strip-types
    SERVER_JS="$SCRIPT_DIR/packages/web/dist/server/src/index.js"
    if [[ -f "$SERVER_JS" ]]; then
      echo "Starting web server (pre-built, WSL)..."
      "$WSL_NODE" "$SERVER_JS" ${ARGS[@]+"${ARGS[@]}"} &
    else
      echo "Starting web server (WSL)..."
      "$WSL_NODE" \
        --experimental-strip-types \
        "$SCRIPT_DIR/packages/web/server/src/index.ts" \
        ${ARGS[@]+"${ARGS[@]}"} &
    fi
    SERVER_PID=$!
    echo "Server PID: $SERVER_PID"
  fi

  if [[ "$SERVER_ONLY" != "true" ]]; then
    VITE_DIST="$SCRIPT_DIR/packages/web/client/dist/index.html"
    if [[ -f "$VITE_DIST" ]]; then
      echo "Client already built, server will serve static files."
      echo "Skipping Vite dev server."
    else
      echo "Starting Vite dev server (WSL)..."
      cd "$SCRIPT_DIR/packages/web"
      "$WSL_NODE" \
        --experimental-strip-types \
        "$SCRIPT_DIR/node_modules/vite/bin/vite.js" \
        --config "$SCRIPT_DIR/packages/web/vite.config.ts" &
      VITE_PID=$!
      echo "Vite PID: $VITE_PID"
    fi
  fi
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

  # Use tsx's actual CLI entry point instead of .bin symlink (more reliable on Windows)
  TSX_CLI="$SCRIPT_DIR/node_modules/tsx/dist/cli.mjs"

  if [[ "$CLIENT_ONLY" != "true" ]]; then
    # Prefer pre-built JS to avoid esbuild cross-platform issues
    SERVER_JS="$SCRIPT_DIR/packages/web/dist/server/src/index.js"
    if [[ -f "$SERVER_JS" ]]; then
      echo "Starting web server (pre-built)..."
      node "$SERVER_JS" ${ARGS[@]+"${ARGS[@]}"} &
    elif [[ -f "$TSX_CLI" ]]; then
      echo "Starting web server (tsx)..."
      node "$TSX_CLI" \
        --tsconfig "$SCRIPT_DIR/tsconfig.json" \
        "$SCRIPT_DIR/packages/web/server/src/index.ts" \
        ${ARGS[@]+"${ARGS[@]}"} &
    else
      echo "Error: neither pre-built server nor tsx found. Run 'npm install && npm run build' first." >&2
      exit 1
    fi
    SERVER_PID=$!
    echo "Server PID: $SERVER_PID"
  fi

  if [[ "$SERVER_ONLY" != "true" ]]; then
    VITE_DIST="$SCRIPT_DIR/packages/web/client/dist/index.html"
    if [[ -f "$VITE_DIST" ]]; then
      echo "Client already built, server will serve static files."
      echo "Skipping Vite dev server."
    elif [[ -f "$TSX_CLI" ]]; then
      echo "Starting Vite dev server..."
      cd "$SCRIPT_DIR/packages/web"
      node "$TSX_CLI" \
        --tsconfig "$SCRIPT_DIR/tsconfig.json" \
        "$SCRIPT_DIR/node_modules/vite/bin/vite.js" \
        --config "$SCRIPT_DIR/packages/web/vite.config.ts" &
      VITE_PID=$!
      echo "Vite PID: $VITE_PID"
    else
      echo "Warning: tsx not found, cannot start Vite. Run 'npm install' first." >&2
    fi
  fi
fi

CLIENT_URL="http://localhost:5173"
VITE_DIST="$SCRIPT_DIR/packages/web/client/dist/index.html"
if [[ -f "$VITE_DIST" ]]; then
  CLIENT_URL="http://localhost:3001"
fi

echo ""
echo "=== Web UI started ==="
if [[ "$CLIENT_ONLY" != "true" ]]; then
  echo "Server: http://localhost:3001"
fi
if [[ "$SERVER_ONLY" != "true" ]]; then
  echo "Client: $CLIENT_URL"
fi
echo ""
echo "Press Ctrl+C to stop all."

# Wait for background processes
trap 'echo "Stopping..."; kill 0; exit 0' INT TERM
wait
