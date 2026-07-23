#!/usr/bin/env pwsh
<#
.DESCRIPTION
  Start the eagent Web UI (server + Vite dev client).
  Mirrors web-start.sh for Windows PowerShell.
.PARAMETER ClientOnly
  Start only the Vite dev server, skip the backend.
.PARAMETER ServerOnly
  Start only the backend server, skip the Vite dev server.
#>
param(
  [switch]$ClientOnly,
  [switch]$ServerOnly
)

$proxyHost = "127.0.0.1"
$proxyPort = "7892"

Write-Host "Setting proxy: http://${proxyHost}:${proxyPort}" -ForegroundColor Cyan

$env:https_proxy = "http://${proxyHost}:${proxyPort}"
$env:http_proxy = "http://${proxyHost}:${proxyPort}"
$env:no_proxy = "litellm.stary.ltd,localhost,127.0.0.1"
$env:NODE_USE_ENV_PROXY = "1"

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "scripts/import-llm-env.ps1") -ProjectRoot $ScriptDir

# --- Resolve Node.js ---
$nodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeBin) {
  Write-Error "node was not found in PATH."
  exit 1
}

# --- tsx CLI ---
$tsxCli = Join-Path $ScriptDir "node_modules/tsx/dist/cli.mjs"
$tsConfig = Join-Path $ScriptDir "tsconfig.json"

# --- Launch server ---
if (-not $ClientOnly) {
  $serverJs = Join-Path $ScriptDir "packages/web/dist/server/src/index.js"
  if (Test-Path $serverJs) {
    Write-Host "Starting web server (pre-built)..."
    $serverProc = Start-Process -FilePath $nodeBin -ArgumentList $serverJs -PassThru -NoNewWindow
  }
  elseif (Test-Path $tsxCli) {
    Write-Host "Starting web server (tsx)..."
    $serverArgs = @(
      $tsxCli,
      "--tsconfig", $tsConfig,
      (Join-Path $ScriptDir "packages/web/server/src/index.ts")
    )
    $serverProc = Start-Process -FilePath $nodeBin -ArgumentList $serverArgs -PassThru -NoNewWindow
  }
  else {
    Write-Error "Neither pre-built server nor tsx found. Run 'npm install && npm run build' first."
    exit 1
  }
  Write-Host "Server PID: $($serverProc.Id)"
}

# --- Launch Vite dev server ---
if (-not $ServerOnly) {
  $viteDist = Join-Path $ScriptDir "packages/web/client/dist/index.html"
  if (Test-Path $viteDist) {
    Write-Host "Client already built, server will serve static files."
    Write-Host "Skipping Vite dev server."
  }
  elseif (Test-Path $tsxCli) {
    Write-Host "Starting Vite dev server..."
    Push-Location (Join-Path $ScriptDir "packages/web")
    $viteArgs = @(
      $tsxCli,
      "--tsconfig", $tsConfig,
      (Join-Path $ScriptDir "node_modules/vite/bin/vite.js"),
      "--config", (Join-Path $ScriptDir "packages/web/vite.config.ts")
    )
    $viteProc = Start-Process -FilePath $nodeBin -ArgumentList $viteArgs -PassThru -NoNewWindow
    Pop-Location
    Write-Host "Vite PID: $($viteProc.Id)"
  }
  else {
    Write-Warning "tsx not found, cannot start Vite. Run 'npm install' first."
  }
}

# --- URLs ---
$clientUrl = "http://localhost:5173"
$viteDist = Join-Path $ScriptDir "packages/web/client/dist/index.html"
if (Test-Path $viteDist) {
  $clientUrl = "http://localhost:3001"
}

Write-Host ""
Write-Host "=== Web UI started ==="
if (-not $ClientOnly) {
  Write-Host "Server: http://localhost:3001"
}
if (-not $ServerOnly) {
  Write-Host "Client: $clientUrl"
}
Write-Host ""
Write-Host "Press Ctrl+C to stop all."

# --- Wait for Ctrl+C ---
try {
  while ($true) {
    Start-Sleep -Seconds 1
    # Check if child processes are still alive
    if ($serverProc -and $serverProc.HasExited) {
      Write-Host "Server process exited."
      break
    }
  }
}
finally {
  Write-Host "Stopping..."
  if ($serverProc -and -not $serverProc.HasExited) { $serverProc.Kill() }
  if ($viteProc -and -not $viteProc.HasExited) { $viteProc.Kill() }
}
