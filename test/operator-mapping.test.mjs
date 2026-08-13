import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOperatorPrices, findOperator } from '../scripts/lib/operator-mapping.mjs'

const config = {
  operators: [
    { id: 'kople', name: 'Kople', aliases: ['kople'] },
    { id: 'lad-opp', name: 'Lad Opp', aliases: ['lad opp'] },
    { id: 'mer', name: 'Mer', aliases: ['mer norway'] }
  ]
}

test('stasjonsnavn vinner over driftsselskap ved operatørmapping', () => {
  const station = { name: 'Lad Opp Mosjøen', operator: { name: 'Kople AS' } }
  assert.equal(findOperator(station, config).id, 'lad-opp')
})

test('korte alias gir ikke deltreff i vanlige ord', () => {
  const station = { name: 'Sommerstasjonen', operator: { name: 'Ukjent AS' } }
  assert.equal(findOperator(station, config), null)
})

test('operatørpriser kobles til en normalisert NOBIL-stasjon', () => {
  const stations = [{ name: 'Test', operator: { name: 'Mer Norway AS' }, prices: [] }]
  const prices = { operators: [{
    id: 'mer', status: 'current', sourceUrl: 'https://example.test', fetchedAt: '2026-01-01T00:00:00Z',
    rates: [{ customerType: 'drop-in', label: 'Hurtiglading', amount: 6.29, currency: 'NOK', unit: 'kWh', power: { minKw: 50, maxKw: null }, time: null, monthlyFee: null }]
  }] }
  applyOperatorPrices(stations, prices, config)
  assert.equal(stations[0].operator.id, 'mer')
  assert.equal(stations[0].prices[0].periods[0].rates[0], 6.29)
})

