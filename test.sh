#!/usr/bin/env bash
set -e

AUTH_FILE="$(pwd)/.eagent/auth.json"
AUTH_BACKUP="$(pwd)/.eagent/auth.json.bak"

# If a stale .bak exists from a previous crashed run, restore it first.
# This prevents an empty auth.json from overwriting a valid .bak on the next run.
# We check "has at least one provider key" rather than just "non-empty" because
# an empty JSON object `{}` is 3 bytes and passes -s.
_has_keys() {
    local f="$1"
    [[ -f "$f" ]] && python3 -c "
import json, sys
with open('$f') as fh:
    d = json.load(fh)
if not isinstance(d, dict) or len(d) == 0:
    sys.exit(1)
" 2>/dev/null
}

if _has_keys "$AUTH_BACKUP" && ! _has_keys "$AUTH_FILE"; then
    cp "$AUTH_BACKUP" "$AUTH_FILE"
    echo "Restored auth.json from stale backup"
fi

# Restore auth.json on exit (success or failure)
cleanup() {
    if [[ -f "$AUTH_BACKUP" && -s "$AUTH_BACKUP" ]]; then
        cp "$AUTH_BACKUP" "$AUTH_FILE"
        rm -f "$AUTH_BACKUP"
        echo "Restored auth.json"
    fi
}
trap cleanup EXIT

# Move auth.json out of the way (cp + rm, never overwrite .bak)
if _has_keys "$AUTH_FILE"; then
    cp "$AUTH_FILE" "$AUTH_BACKUP"
    rm "$AUTH_FILE"
    echo "Moved auth.json to backup"
fi

# Prevent tests from reaching a configured gateway.
unset LITELLM_API_KEY

echo "Running tests without API keys..."
npm test
