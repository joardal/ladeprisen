# Datapipeline

## Prinsipp

Nettleseren skal aldri snakke direkte med NOBIL, Tesla eller operatørenes kilder. Et lokalt skript henter data, normaliserer dem og publiserer kun en ferdig JSON-fil.

```text
NOBIL-dump ──────┐
Tesla-priser ────┼─> lokal normalisering -> validering -> public/data/stations.json
Operatørpriser ──┘                                      |
                                                        v
                                                Cloudflare Pages
```

Hvis en kilde feiler, beholdes sist godkjente data for den kilden. Et ufullstendig eller ugyldig resultat skal ikke overskrive den offentlige filen.

Nasjonale operatørpriser publiseres også separat i `public/data/operator-prices.json`. Dermed kan prisinnhentingen testes og publiseres før NOBIL-nøkkelen er mottatt.

## Offentlig datamodell

Hver stasjon har stabil ID, navn, posisjon, operatør, kontakter og prisoppføringer. En pris oppgir kundegruppe, valuta, enhet og eventuelle tidsperioder. Hele datasettet har eget skjema-versjonsnummer og byggetidspunkt.

## Videre arbeid

1. Motta og teste NOBIL-nøkkelen med én full norsk datadump.
2. Lage en entydig mapping fra NOBIL-operatørnavn til våre operatør-ID-er.
3. Koble de ferdige operatørprisene til NOBILs operatørnavn.
4. Koble Tesla `locationGUID` til riktige NOBIL-stasjoner.
5. Kjøre lokalt daglig og pushe bare den ferdige JSON-filen.
