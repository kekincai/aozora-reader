$LogPath = Join-Path $PSScriptRoot ("import-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$ErrorActionPreference = 'Stop'
$ExitCode = 0
$PasswordPointer = [IntPtr]::Zero

function Invoke-ImportStep {
  param([string]$Label, [string[]]$Arguments)
  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

Start-Transcript -Path $LogPath -Append | Out-Null
try {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $AozoraRoot = (Resolve-Path (Join-Path $RepoRoot '..\aozorabunko')).Path

  foreach ($Command in @('node.exe', 'npm.cmd')) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
      throw "$Command is required on minipc but was not found in PATH. Install the Node.js LTS release, then open this file again."
    }
  }

  Write-Host "Repository: $RepoRoot"
  Write-Host "Aozora source: $AozoraRoot"
  Write-Host "Node: $(& node.exe --version)"
  Write-Host "npm: $(& npm.cmd --version)"

  $SecurePassword = Read-Host 'PostgreSQL workers_vpc password' -AsSecureString
  $PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)

  $env:PGHOST = '127.0.0.1'
  $env:PGPORT = '5432'
  $env:PGUSER = 'workers_vpc'
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
  $env:PGDATABASE = 'aozora_reader'
  $env:PGSSLMODE = 'require'
  $env:PGSSLMINVERSION = 'TLSv1.3'
  $env:PGSSLREJECTUNAUTHORIZED = 'false'
  $env:AOZORA_ROOT = $AozoraRoot
  $env:AOZORA_CONTENT_BATCH = '20'
  $env:PGPOOL_MAX = '2'

  Set-Location $RepoRoot
  Invoke-ImportStep 'Install importer dependencies' @('install', '--no-audit', '--no-fund')
  Invoke-ImportStep 'Apply PostgreSQL migrations' @('run', 'db:migrate')
  Invoke-ImportStep 'Import complete Aozora catalog and text' @('run', 'db:import:aozora')
  Invoke-ImportStep 'Verify imported database' @('run', 'db:verify')
  Write-Host "`nImport completed. Log: $LogPath" -ForegroundColor Green
} catch {
  $ExitCode = 1
  Write-Host "`nIMPORT FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $LogPath" -ForegroundColor Yellow
} finally {
  if ($PasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer) }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}

exit $ExitCode
