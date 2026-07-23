param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"').Trim("'")
      if ($name -and -not [Environment]::GetEnvironmentVariable($name, "Process")) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
  return $true
}

$projectEnv = Join-Path $ProjectRoot ".env"
$skillEnv = Join-Path $env:USERPROFILE ".codex\skills\museframe-llm-migrate\credentials.env"

$credentialSource = $null
if (Import-DotEnvFile -Path $projectEnv) {
  $credentialSource = $projectEnv
}
if (Import-DotEnvFile -Path $skillEnv) {
  if (-not $credentialSource) {
    $credentialSource = $skillEnv
  }
}

$supportToken = $env:SMART_SERVICE_SUPPORT_API_TOKEN
if ($supportToken) {
  $supportBaseUrl = if ($env:SMART_SERVICE_SUPPORT_API_BASE_URL) {
    $env:SMART_SERVICE_SUPPORT_API_BASE_URL.TrimEnd("/")
  } else {
    "https://gencomic-support-api.test.stary.ltd"
  }
  $supportServiceId = if ($env:SMART_SERVICE_SUPPORT_API_SERVICE_ID) {
    $env:SMART_SERVICE_SUPPORT_API_SERVICE_ID
  } else {
    "gencomic_auto_video_pre_api"
  }
  $supportEnvironment = if ($env:SMART_SERVICE_SUPPORT_API_ENV) {
    $env:SMART_SERVICE_SUPPORT_API_ENV
  } else {
    "Test"
  }
  $supportUri = "$supportBaseUrl/config/services/$supportServiceId`?env=$([uri]::EscapeDataString($supportEnvironment))"
  $supportHeaders = @{ "X-Support-Token" = $supportToken }

  try {
    $config = Invoke-RestMethod -Uri $supportUri -Headers $supportHeaders -Method Get -TimeoutSec 30
    $resolved = @()

    if (-not $env:LITELLM_API_KEY -and $config.OPENAI_ENDPOINTS.deepseek.api_key) {
      $env:LITELLM_API_KEY = [string]$config.OPENAI_ENDPOINTS.deepseek.api_key
    }
    if ($env:LITELLM_API_KEY) {
      $resolved += "DeepSeek"
    }

    if (-not $env:OPENAI_API_KEY -and $config.OPENAI.api_key) {
      $env:OPENAI_API_KEY = [string]$config.OPENAI.api_key
    }
    if ($env:OPENAI_API_KEY) {
      $resolved += "OpenAI"
    }

    if (-not $env:GEMINI_API_KEY -and $config.GEMINI.api_key) {
      $env:GEMINI_API_KEY = [string]$config.GEMINI.api_key
    }
    if ($env:GEMINI_API_KEY -or $env:GOOGLE_API_KEY) {
      $resolved += "Gemini"
    }

    Write-Host "LLM credentials loaded from Support API: $($resolved -join ', ')" -ForegroundColor Green
  }
  catch {
    Write-Warning "Support API configuration failed: $($_.Exception.Message)"
  }
}

$missing = @()
if (-not $env:LITELLM_API_KEY) { $missing += "LITELLM_API_KEY" }
if (-not $env:OPENAI_API_KEY) { $missing += "OPENAI_API_KEY" }
if (-not $env:GEMINI_API_KEY -and -not $env:GOOGLE_API_KEY) { $missing += "GEMINI_API_KEY or GOOGLE_API_KEY" }

if ($missing.Count -gt 0) {
  $sourceHint = if ($credentialSource) { "Loaded base credentials from $credentialSource." } else { "No credential file was found." }
  throw "Missing LLM credentials: $($missing -join ', '). $sourceHint"
}
