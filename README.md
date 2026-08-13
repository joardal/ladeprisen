# Ladeprisen

Ladeprisen skal gjøre det enkelt å finne den rimeligste hurtigladingen i nærheten. Første versjon er en statisk nettside der én validert JSON-fil bygges lokalt én gang per dag.

## Status

- Tesla-priser: teknisk løsning verifisert mot Teslas nåværende app-API.
- NOBIL: adapter og datamodell er klare; API-nøkkel er søkt om.
- Andre operatører: legges til som egne, små prisadaptere.
- Domene og Cloudflare Pages: kan kobles på når domenet er kjøpt.

## Lokal oppstart

Krav: Node.js 20 eller nyere.

```powershell
npm test
npm run build
npx --yes serve public
```

Siden ligger i `public/`. Cloudflare Pages kan derfor publisere mappen direkte uten en server eller database.

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

Oppdateringen laster først ned og validerer kildedata. Den offentlige `stations.json` erstattes atomisk bare når hele resultatet er gyldig. API-nøkler og tokenverdier blir aldri skrevet til konsollen eller den offentlige filen.

Se [docs/data-pipeline.md](docs/data-pipeline.md) for flyten og [docs/nobil-application.txt](docs/nobil-application.txt) for søknadsteksten.

## Datasikkerhet

- NOBIL-API-et eksponeres aldri for nettleseren.
- Tesla-token brukes bare i det lokale oppdateringsskriptet.
- `.env`, `.secrets/`, rådata og lokal cache er blokkert av `.gitignore`.
- Publiserte data inneholder kilde, hentetidspunkt og attribusjon, men ingen API-nøkler eller personopplysninger.

