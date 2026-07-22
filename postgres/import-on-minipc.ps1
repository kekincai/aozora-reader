$LogPath = Join-Path $PSScriptRoot ("import-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8
$ExitCode = 0
$PasswordPointer = [IntPtr]::Zero
Set-Content -Path $LogPath -Value ("Aozora import started " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8

function Write-ImportMessage {
  param([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray)
  Write-Host $Message -ForegroundColor $Color
  Add-Content -Path $LogPath -Value $Message -Encoding UTF8
}

function Invoke-ImportStep {
  param([string]$Label, [string[]]$Arguments)
  Write-ImportMessage "`n== $Label ==" Cyan
  & npm.cmd @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

try {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $AozoraRoot = (Resolve-Path (Join-Path $RepoRoot '..\aozorabunko')).Path

  foreach ($Command in @('node.exe', 'npm.cmd')) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
      throw "$Command is required on minipc but was not found in PATH. Install the Node.js LTS release, then open this file again."
    }
  }

  Write-ImportMessage "Repository: $RepoRoot"
  Write-ImportMessage "Aozora source: $AozoraRoot"
  Write-ImportMessage "Node: $(& node.exe --version)"
  Write-ImportMessage "npm: $(& npm.cmd --version)"

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
  $env:AOZORA_CONTENT_BATCH = '50'
  $env:AOZORA_CONTENT_BATCH_BYTES = '8388608'
  $env:PGPOOL_MAX = '2'

  Set-Location $RepoRoot
  Invoke-ImportStep 'Install importer dependencies' @('install', '--no-audit', '--no-fund')
  Invoke-ImportStep 'Apply PostgreSQL migrations' @('run', 'db:migrate')
  Invoke-ImportStep 'Import complete Aozora catalog and text' @('run', 'db:import:aozora')
  Invoke-ImportStep 'Compact PostgreSQL storage' @('run', 'db:compact')
  Invoke-ImportStep 'Verify imported database' @('run', 'db:verify')
  Write-ImportMessage "`nImport completed. Log: $LogPath" Green
} catch {
  $ExitCode = 1
  Write-ImportMessage "`nIMPORT FAILED: $($_.Exception.Message)" Red
  Write-ImportMessage "Log: $LogPath" Yellow
} finally {
  if ($PasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer) }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

exit $ExitCode
