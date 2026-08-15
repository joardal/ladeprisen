# Ladeprisen

Ladeprisen skal gjøre det enkelt å finne den rimeligste hurtigladingen i nærheten. Første versjon er en statisk nettside der én validert JSON-fil bygges lokalt én gang per dag.

## Status

- Tesla-priser: alle 166 hurtigladestasjoner oppdages fra NOBIL, med separate satser for Tesla-eiere og andre biler.
- NOBIL: aktiv datadump med offentlig tilgjengelige norske hurtigladestasjoner på minst 50 kW.
- Operatørpriser: ti åpne, offisielle kilder og to tydelig merkede kontrollkilder oppdateres automatisk.
- Kart, søk, effektfilter, GPS-sortering og navigasjonslenker er klare lokalt.
- Tretti statiske bysider med 10 km radius, lokale topplister, canonical-metadata, internlenker og automatisk sitemap bygges fra én felles mal.
- Sist publiserte versjon ligger på https://ladepris.pages.dev/.

## Lokal oppstart

Krav: Node.js 20 eller nyere.

```powershell
npm test
npm run build
npx --yes serve dist
```

Cloudflare Pages kan bruke byggekommandoen `npm run build` og publisere `dist/`. Bygget oppdaterer også `public/`, slik at den eksisterende direktepubliseringen fra `public/` fortsatt fungerer.

Produksjonsbygget ligger i `dist/` og inkluderer genererte sider under `/ladepriser/`. Byene og koordinatene vedlikeholdes samlet i `config/cities.json`; HTML-malen ligger i `scripts/templates/city-page.mjs`. Endringer i malen gjelder dermed alle bysidene ved neste bygg.

Canonical-adresser og sitemap bruker `SITE_URL`. Standardverdien er dagens Pages-adresse. Når eget domene er klart, settes variabelen én gang i Cloudflare Pages:

```text
SITE_URL=https://ladeprisen.no
```

## Lokal dataoppdatering

Hemmeligheter skal bare ligge i miljøvariabler eller i den ignorerte filen `.secrets/tesla-tokens.json`:

```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

Alternativt kan de settes for én PowerShell-økt:

```powershell
$env:NOBIL_API_KEY = "..."
$env:TESLA_REFRESH_TOKEN = "..."
npm run data:update
```

For lokal utvikling kan verdiene legges i en ignorert `.env`-fil og kjøres slik:

```powershell
npm run data:update:local
```

Hele dagsjobben kan forhåndskjøres uten publisering:

```powershell
.\scripts\run-daily.ps1
```

Når publisering er ønsket, legger `-Publish` kun de validerte datafilene i en egen commit og pusher til `main`:

```powershell
.\scripts\run-daily.ps1 -Publish
```

Oppdateringen laster først ned og validerer kildedata. Den offentlige `stations.json` erstattes atomisk bare når hele resultatet er gyldig. API-nøkler og tokenverdier blir aldri skrevet til konsollen eller den offentlige filen.

Etter validering lager dagsjobben også komprimerte, datostemplede kopier av både `stations.json` og `operator-prices.json` under `data/history/ÅÅÅÅ-MM-DD/`. Filene opprettes med eksklusiv skriving og kan derfor aldri overskrive et tidligere øyeblikksbilde. Historikken er lokal og ignorert av Git; `public/data/` inneholder alltid siste versjon som nettsiden bruker.

Et øyeblikksbilde kan også opprettes manuelt:

```powershell
npm run data:archive
```

Operatørprisene kan oppdateres uavhengig av NOBIL:

```powershell
npm run prices:update
```

Kilder som kun viser pris på fysisk lader eller i app, merkes eksplisitt som manuelle. Et manglende tall skal aldri erstattes med gjetning eller et gammelt tredjepartstall.

Når en operatør ikke publiserer en tilsvarende nettpris, kan Norsk elbilforenings ukentlige oversikt brukes som fallback. Slike priser lagrer både kildens oppdateringstidspunkt og statusen `fallback`, og kan derfor ikke forveksles med dagens operatørverifiserte priser.

Se [docs/data-pipeline.md](docs/data-pipeline.md) for flyten og [docs/nobil-application.txt](docs/nobil-application.txt) for søknadsteksten.

## Datasikkerhet

- NOBIL-API-et eksponeres aldri for nettleseren.
- Tesla-token brukes bare i det lokale oppdateringsskriptet.
- `.env`, `.secrets/`, rådata og lokal cache er blokkert av `.gitignore`.
- Publiserte data inneholder kilde, hentetidspunkt og attribusjon, men ingen API-nøkler eller personopplysninger.
