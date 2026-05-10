param(
  [int]$Port = 8000,
  [switch]$NoReload,
  [switch]$SkipPortCleanup,
  [switch]$OnlyCleanup
)

$ErrorActionPreference = "Stop"

function Test-DockerDaemonAvailable {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    return $false
  }

  & docker version --format "{{.Server.Version}}" 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Stop-HostApiListeners {
  param([int]$TargetPort)

  $listeners = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) {
    Write-Host "[run_uvicorn] Port $TargetPort is already free."
  } else {
    $listenerPids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($listenerPid in $listenerPids) {
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
      if (-not $processInfo) {
        continue
      }

      $name = [string]$processInfo.Name
      $commandLine = [string]$processInfo.CommandLine
      $isBackendProcess = $false

      if ($name -eq "uvicorn.exe") {
        $isBackendProcess = $true
      } elseif ($commandLine) {
        if ($commandLine -like "*uvicorn*app.main:app*" -or $commandLine -match "ai-code-review-platform[\\/]+apps[\\/]+backend") {
          $isBackendProcess = $true
        }
      }

      if (-not $isBackendProcess) {
        throw "[run_uvicorn] Port $TargetPort is used by PID $listenerPid ($name). Refusing to stop a non-backend process."
      }

      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
      Write-Host "[run_uvicorn] Stopped backend listener PID $listenerPid on port $TargetPort."
    }
  }

  if (Test-DockerDaemonAvailable) {
    $containerIds = @(
      & docker ps --filter "name=^ai-review-api$" --filter "publish=$TargetPort" --format "{{.ID}}" 2>$null
    )
    foreach ($containerId in $containerIds) {
      $trimmed = [string]$containerId
      if ($trimmed.Trim().Length -eq 0) {
        continue
      }
      docker stop $trimmed | Out-Null
      Write-Host "[run_uvicorn] Stopped Docker container ai-review-api to free port $TargetPort."
    }

    # Prevent host API + Docker worker mixed mode from consuming the same queue
    # with different DATABASE_URL values, which can leave analyses stuck in QUEUED.
    $workerIds = @(
      & docker ps --filter "name=^ai-review-worker$" --format "{{.ID}}" 2>$null
    )
    foreach ($workerId in $workerIds) {
      $trimmedWorkerId = [string]$workerId
      if ($trimmedWorkerId.Trim().Length -eq 0) {
        continue
      }
      docker stop $trimmedWorkerId | Out-Null
      Write-Host "[run_uvicorn] Stopped Docker container ai-review-worker to avoid host/container queue mismatch."
    }
  }
}

if (-not $SkipPortCleanup -or $OnlyCleanup) {
  Stop-HostApiListeners -TargetPort $Port
}

if ($OnlyCleanup) {
  exit 0
}

$env:WATCHFILES_FORCE_POLLING = if ($env:WATCHFILES_FORCE_POLLING) { $env:WATCHFILES_FORCE_POLLING } else { "true" }

$launcherArgs = @('run', 'python', '-m', 'scripts.run_host_uvicorn', '--port', "$Port")

if ($NoReload) {
  $launcherArgs += '--no-reload'
}

& poetry @launcherArgs
exit $LASTEXITCODE
