import { resolve } from 'node:path'
import { readJson, writeJsonAtomic } from './lib/io.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'
import { ELBIL_REFERENCE_SOURCE, FALLBACK_OPERATOR_SOURCES, fetchElbilReference, fetchOperatorSource, MANUAL_OPERATOR_SOURCES, OPERATOR_SOURCES } from './providers/operators.mjs'

const outputPath = resolve(process.cwd(), 'public/data/operator-prices.json')
const previous = await readJson(outputPath, { schemaVersion: 1, generatedAt: null, operators: [] })
const previousById = new Map(previous.operators.map(operator => [operator.id, operator]))

const results = await Promise.all(OPERATOR_SOURCES.map(async source => {
  try {
    const operator = await fetchOperatorSource(source)
    console.log(`${operator.name}: ${operator.rates.length} priser lest fra offisiell kilde.`)
    return operator
  } catch (error) {
    const old = previousById.get(source.id)
    if (!old || !old.rates?.length) throw new Error(`${source.name}: ${error.message}, og ingen tidligere pris finnes`)
    console.warn(`${source.name}: kilden feilet (${error.message}); beholder sist godkjente priser.`)
    return { ...old, status: 'stale', checkedAt: new Date().toISOString() }
  }
}))

let fallback = []
try {
  const reference = await fetchElbilReference()
  fallback = FALLBACK_OPERATOR_SOURCES.map(source => {
    const value = reference.prices[source.referenceName]
    if (!Number.isFinite(value)) throw new Error(`Fant ikke ${source.name} i kontrollkilden`)
    return {
      id: source.id,
      name: source.name,
      status: 'fallback',
      sourceUrl: ELBIL_REFERENCE_SOURCE.pageUrl,
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: reference.sourceUpdatedAt,
      reason: 'Ukentlig kontrollkilde; operatøren publiserer ikke en tilsvarende nasjonal nettpris.',
      rates: [{
        customerType: 'drop-in',
        label: 'Dagtid, høyeste regionspris (Elbilforeningen)',
        amount: value,
        currency: 'NOK',
        unit: 'kWh',
        power: { minKw: 150, maxKw: null },
        time: null,
        monthlyFee: null,
        region: 'highest-national'
      }]
    }
  })
  console.log(`Elbilforeningen: ${fallback.length} fallback-priser lest; kilden er oppdatert ${reference.sourceUpdatedAt}.`)
} catch (error) {
  fallback = FALLBACK_OPERATOR_SOURCES.map(source => {
    const old = previousById.get(source.id)
    if (!old?.rates?.length) throw new Error(`${source.name}: fallback feilet (${error.message}), og ingen tidligere pris finnes`)
    return { ...old, status: 'stale', checkedAt: new Date().toISOString() }
  })
  console.warn(`Elbilforeningen: kontrollkilden feilet (${error.message}); beholder sist godkjente fallback-priser.`)
}

const manual = MANUAL_OPERATOR_SOURCES.map(source => ({
  ...source,
  status: 'manual',
  fetchedAt: null,
  rates: []
}))

const dataset = validateOperatorPrices({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  operators: [...results, ...fallback, ...manual].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
})
await writeJsonAtomic(outputPath, dataset)
console.log(`Ferdig: ${results.length} offisielle, ${fallback.length} fallback- og ${manual.length} lokasjonsbasert operatørkilde.`)
