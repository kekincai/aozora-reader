$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$AozoraRoot = (Resolve-Path (Join-Path $RepoRoot '..\aozorabunko')).Path
$LogPath = Join-Path $PSScriptRoot ("import-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

foreach ($Command in @('node', 'npm', 'git')) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$Command is required on minipc but was not found in PATH."
  }
}

$SecurePassword = Read-Host 'PostgreSQL workers_vpc password' -AsSecureString
$PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)

function Invoke-ImportStep {
  param([string]$Label, [string[]]$Arguments)
  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  & npm.cmd @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

try {
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
} finally {
  if ($PasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer) }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

