#!/usr/bin/env bash
set -e

AUTH_FILE="$(pwd)/.eagent/auth.json"
AUTH_BACKUP="$(pwd)/.eagent/auth.json.bak"

# Restore auth.json on exit (success or failure)
cleanup() {
    if [[ -f "$AUTH_BACKUP" ]]; then
        mv "$AUTH_BACKUP" "$AUTH_FILE"
        echo "Restored auth.json"
    fi
}
trap cleanup EXIT

# Move auth.json out of the way
if [[ -f "$AUTH_FILE" ]]; then
    mv "$AUTH_FILE" "$AUTH_BACKUP"
    echo "Moved auth.json to backup"
fi

# Prevent tests from reaching a configured gateway.
unset LITELLM_API_KEY

echo "Running tests without API keys..."
npm test
