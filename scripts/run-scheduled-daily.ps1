$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'data\logs'
$logFile = Join-Path $logDirectory ("daily-update-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$toolDirectories = @(
  (Join-Path $env:ProgramFiles 'nodejs'),
  (Join-Path $env:ProgramFiles 'Git\cmd')
)
$env:Path = (($toolDirectories + $env:Path) -join ';')

Start-Transcript -Path $logFile -Append | Out-Null
try {
  Write-Host ("Starter planlagt prisoppdatering {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  & (Join-Path $PSScriptRoot 'run-daily.ps1') -Publish
  Write-Host ("Planlagt prisoppdatering fullført {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
} catch {
  Write-Error ("Planlagt prisoppdatering feilet: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
