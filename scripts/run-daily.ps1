param(
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

npm run prices:update
if ($LASTEXITCODE -ne 0) {
  throw 'Oppdatering av operatørpriser feilet.'
}

try {
  npm run data:update:local
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Stasjonsoppdateringen kunne ikke kjøres. Operatørprisene blir fortsatt kontrollert og kan publiseres.'
  }
} catch {
  Write-Warning 'Stasjonsoppdateringen kunne ikke kjøres. Operatørprisene blir fortsatt kontrollert og kan publiseres.'
}
npm run check
if ($LASTEXITCODE -ne 0) {
  throw 'Kontrollene feilet; ingenting blir publisert.'
}

npm run data:archive
if ($LASTEXITCODE -ne 0) {
  throw 'Arkivering av dagens validerte JSON-filer feilet; ingenting blir publisert.'
}

if (-not $Publish) {
  Write-Host 'Data er oppdatert og kontrollert lokalt. Bruk -Publish for å committe og pushe stations.json.'
  return
}

$changed = git status --porcelain -- public/data/stations.json public/data/operator-prices.json public/ladepriser public/sitemap.xml public/robots.txt public/index.html
if (-not $changed) {
  Write-Host 'Ingen dataendringer; ingenting å publisere.'
  return
}

git add -- public/data/stations.json public/data/operator-prices.json public/ladepriser public/sitemap.xml public/robots.txt public/index.html
if ($LASTEXITCODE -ne 0) {
  throw 'Git klarte ikke å klargjøre de validerte filene for publisering.'
}

$date = Get-Date -Format 'yyyy-MM-dd'
git commit -m "data: oppdater ladepriser $date"
if ($LASTEXITCODE -ne 0) {
  throw 'Git klarte ikke å opprette dagens datacommit.'
}

git push origin main
if ($LASTEXITCODE -ne 0) {
  throw 'Git klarte ikke å pushe dagens prisoppdatering.'
}
