# Operatørkilder

Ladeprisen bruker operatørenes egne, åpne prissider som primærkilder. Norsk elbilforenings oversikt brukes senere som en uavhengig kontroll, ikke som datakilde.

## Automatisk kontrollert

| Operatør | Offisiell kilde | Merknad |
| --- | --- | --- |
| Circle K | https://www.circlek.no/lading/ladepriser | Drop-in og gratis registrert kundepris |
| Eviny | https://hurtiglading.eviny.no/ | Hurtig-/lynlading |
| IONITY | https://www.ionity.eu/subscriptions | Norske IONITY Direct- og apppriser |
| Ishavsveien | https://www.ishavsveien.no/priser/ | Egne satser etter effekt |
| Kople | https://www.kople.no/veiledning/ladepris | Drop-in, registrert og nattpris |
| Lad Opp | https://ladopp.no/betaling/ | Hurtig-/lynlading |
| Mer | https://no.mer.eco/ladenettverk/priser/ | Samme pris for drop-in og registrert |
| Ragde Charge | https://ragde.no/charge/ | Regionale priser for Sør og Nord/Midt |
| Recharge | https://rechargeinfra.com/no/ | Drop-in og abonnement |

## Ukentlig fallback

- E.ON Drive & Clever og Uno-X hentes fra Norsk elbilforenings Infogram.
- Kildens eget `updatedAt` følger hvert tall.
- Prisene er merket `fallback`, og beskrives som dagtid/høyeste regionspris.

## Krever særbehandling

- Tesla varierer per stasjon og tidspunkt; egen Tesla-adapter brukes.

Uno-X har et offentlig ladekart-endepunkt med 82 elektriske lokasjoner, men det inneholder foreløpig effekt og adresse, ikke kortpris. Appkilder kan vurderes dersom endepunktet er offentlig, stabilt og prisen gjelder samme betalingsmåte som vi viser.
