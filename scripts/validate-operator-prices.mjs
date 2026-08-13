import { resolve } from 'node:path'
import { readJson } from './lib/io.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'

const path = resolve(process.cwd(), process.argv[2] || 'public/data/operator-prices.json')
const dataset = validateOperatorPrices(await readJson(path))
console.log(`Gyldige operatørpriser: ${dataset.operators.length} operatører.`)

