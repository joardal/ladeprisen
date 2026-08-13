import { resolve } from 'node:path'
import { readJson, writeJsonAtomic } from './lib/io.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'
import { fetchOperatorSource, MANUAL_OPERATOR_SOURCES, OPERATOR_SOURCES } from './providers/operators.mjs'

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

const manual = MANUAL_OPERATOR_SOURCES.map(source => ({
  ...source,
  status: 'manual',
  fetchedAt: null,
  rates: []
}))

const dataset = validateOperatorPrices({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  operators: [...results, ...manual].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
})
await writeJsonAtomic(outputPath, dataset)
console.log(`Ferdig: ${results.length} automatiske og ${manual.length} særbehandlede operatørkilder.`)

