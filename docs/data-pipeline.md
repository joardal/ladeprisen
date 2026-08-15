# Datapipeline

## Prinsipp

Nettleseren skal aldri snakke direkte med NOBIL, Tesla eller operatørenes kilder. Et lokalt skript henter data, normaliserer dem og publiserer kun en ferdig JSON-fil.

```text
NOBIL-dump ──────┐
Tesla-priser ────┼─> lokal normalisering -> validering -> public/data/stations.json
Operatørpriser ──┘             |                        |
                               v                        v
                    datostemplet lokalhistorikk  Cloudflare Pages
```

Hvis en kilde feiler, beholdes sist godkjente data for den kilden. Et ufullstendig eller ugyldig resultat skal ikke overskrive den offentlige filen.

Nasjonale operatørpriser publiseres også separat i `public/data/operator-prices.json`. Dermed kan prisinnhentingen testes og publiseres før NOBIL-nøkkelen er mottatt.

## Offentlig datamodell

Hver stasjon har stabil ID, navn, posisjon, operatør, kontakter og prisoppføringer. En pris oppgir kundegruppe, valuta, enhet og eventuelle tidsperioder. Hele datasettet har eget skjema-versjonsnummer og byggetidspunkt.

## Videre arbeid

1. Vedlikeholde gyldig Tesla refresh-token for automatisk dagsjobb.
2. Utvide operatørmappingen når flere offisielle prisavtaler eller kilder blir tilgjengelige.
3. Automatisere lokal dagsjobb og pushe bare validerte, offentlige datafiler.

## NOBIL-normalisering

NOBIL-dumpen inneholder både normallading, hurtiglading og ladeanlegg med begrenset adgang. Den offentlige filen begrenses derfor til stasjoner merket `Public` med minst én elektrisk kontakt på 50 kW eller mer. Ladeeffekt leses fra NOBILs oversatte verdier, for eksempel `150 kW DC`. Kontakt- og oppretterfelt fra rådata publiseres ikke.

Operatørprisene kobles mot normaliserte operatørnavn. Effektbaserte priser brukes bare når stasjonens høyeste oppgitte effekt passer prisnivået, og regionale priser velges fra stasjonens fylke.

Tesla-stasjoner oppdages automatisk fra NOBILs OCPI-mapping (`US#TSL#<locationGUID>`). Prisadapteren henter både Tesla-bilpris og pris for andre biler per kjent hurtigladestasjon, med begrenset samtidighet og sist-godkjent cache per lokasjon. Tesla-data kobles tilbake til NOBIL-stasjonen med `locationGUID` før geografisk reservekobling brukes.

## Bysider

Produksjonsbygget leser `config/cities.json` og lager én statisk side per by fra den felles malen i `scripts/templates/city-page.mjs`. Stasjoner velges med luftlinjeavstand på 10 km fra det konfigurerte bysentrumet. En side tas bare med dersom minst tre stasjoner har offentlig drop-in-pris. Byoversikten, interne nabolenker, `sitemap.xml`, `robots.txt`, canonical-adresser og metadata genereres samtidig.

## Historikk

`npm run data:archive` validerer de to offentlige JSON-filene og lagrer komprimerte øyeblikksbilder under `data/history/ÅÅÅÅ-MM-DD/`. Filnavnet har full UTC-tid med millisekunder, og eksklusiv filoppretting gjør arkivet append-only. `run-daily.ps1` kjører dette automatisk etter at alle tester og valideringer er bestått.
