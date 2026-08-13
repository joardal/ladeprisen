import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readJson } from './lib/io.mjs'
import { validateDataset } from './lib/validate.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'

const root = process.cwd()
const publicDirectory = resolve(root, 'public')
const outputDirectory = resolve(root, 'dist')
const dataset = validateDataset(await readJson(resolve(publicDirectory, 'data/stations.json')))
const operatorPrices = validateOperatorPrices(await readJson(resolve(publicDirectory, 'data/operator-prices.json')))

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(publicDirectory, outputDirectory, { recursive: true })
console.log(`Bygget dist/ med ${dataset.stations.length} stasjoner og ${operatorPrices.operators.length} operatører.`)
