param(
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

npm run data:update
npm run check

if (-not $Publish) {
  Write-Host 'Data er oppdatert og kontrollert lokalt. Bruk -Publish for å committe og pushe stations.json.'
  exit 0
}

$changed = git status --porcelain -- public/data/stations.json
if (-not $changed) {
  Write-Host 'Ingen endring i stations.json; ingenting å publisere.'
  exit 0
}

git add -- public/data/stations.json
$date = Get-Date -Format 'yyyy-MM-dd'
git commit -m "data: oppdater ladepriser $date"
git push origin main

