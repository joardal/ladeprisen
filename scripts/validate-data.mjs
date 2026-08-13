import { resolve } from 'node:path'
import { readJson } from './lib/io.mjs'
import { validateDataset } from './lib/validate.mjs'

const path = resolve(process.cwd(), process.argv[2] || 'public/data/stations.json')
const dataset = validateDataset(await readJson(path))
console.log(`Gyldig datasett: ${dataset.stations.length} stasjoner.`)

