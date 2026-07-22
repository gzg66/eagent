#!/usr/bin/env pwsh
<#
.DESCRIPTION
  Run the eagent coding-agent CLI (TUI mode).
  Mirrors eagent-test.sh for Windows PowerShell.
.PARAMETER NoEnv
  Unset API keys before running (offline / no-model mode).
#>
param(
  [switch]$NoEnv
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Resolve Node.js ---
$nodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeBin) {
  Write-Error "node was not found in PATH."
  exit 1
}

# --- Suppress API keys when --no-env is set ---
if ($NoEnv) {
  $env:LITELLM_API_KEY = $null
  Write-Host "Running without API keys..."
}

# --- Remaining arguments ---
$cliScript = Join-Path $ScriptDir "packages/coding-agent/src/cli.ts"
$tsxCli = Join-Path $ScriptDir "node_modules/tsx/dist/cli.mjs"
$tsConfig = Join-Path $ScriptDir "tsconfig.json"

# Use tsx CLI entry point directly (.bin/tsx is a bash script, unusable on Windows)
& $nodeBin $tsxCli --tsconfig $tsConfig $cliScript @args
exit $LASTEXITCODE
