import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDataset } from '../scripts/lib/validate.mjs'

test('tomt oppstartsdatasett er gyldig', () => {
  const dataset = { schemaVersion: 1, generatedAt: null, sources: [], stations: [] }
  assert.equal(validateDataset(dataset), dataset)
})

test('duplikate stasjons-ID-er avvises', () => {
  const station = { id: 'x', name: 'X', location: { latitude: 60, longitude: 10 }, connectors: [], prices: [] }
  assert.throws(() => validateDataset({ schemaVersion: 1, generatedAt: null, sources: [], stations: [station, station] }), /duplikat/)
})

