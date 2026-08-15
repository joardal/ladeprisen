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
  const stations = [{ name: 'Test', operator: { name: 'Mer Norway AS' }, connectors: [{ maxPowerKw: 150 }], prices: [] }]
  const prices = { operators: [{
    id: 'mer', status: 'current', sourceUrl: 'https://example.test', fetchedAt: '2026-01-01T00:00:00Z',
    rates: [{ customerType: 'drop-in', label: 'Hurtiglading', amount: 6.29, currency: 'NOK', unit: 'kWh', power: { minKw: 50, maxKw: null }, time: null, monthlyFee: null }]
  }] }
  applyOperatorPrices(stations, prices, config)
  assert.equal(stations[0].operator.id, 'mer')
  assert.equal(stations[0].prices[0].periods[0].rates[0], 6.29)
})

test('effekt- og regionpriser kobles til riktig stasjon', () => {
  const stations = [
    { name: 'Ishavsveien Alta', operator: { name: 'Ishavsveien' }, address: { county: 'Finnmark' }, connectors: [{ maxPowerKw: 100 }], prices: [] },
    { name: 'Ragde Bodø', operator: { name: 'Ragde Charge' }, address: { county: 'Nordland' }, connectors: [{ maxPowerKw: 250 }], prices: [] }
  ]
  const operatorConfig = { operators: [
    { id: 'ishavsveien', name: 'Ishavsveien', aliases: ['ishavsveien'] },
    { id: 'ragde-charge', name: 'Ragde Charge', aliases: ['ragde'] }
  ] }
  const rate = (amount, power, region = null) => ({ customerType: 'drop-in', label: 'Pris', amount, currency: 'NOK', unit: 'kWh', power, time: null, monthlyFee: null, region })
  const prices = { operators: [
    { id: 'ishavsveien', status: 'current', sourceUrl: 'https://example.test', fetchedAt: '2026-01-01T00:00:00Z', rates: [rate(4.25, { minKw: 50, maxKw: 120 }), rate(4.75, { minKw: 150, maxKw: null })] },
    { id: 'ragde-charge', status: 'current', sourceUrl: 'https://example.test', fetchedAt: '2026-01-01T00:00:00Z', rates: [rate(5.99, { minKw: 150, maxKw: null }, 'south'), rate(4.99, { minKw: 150, maxKw: null }, 'north-central')] }
  ] }

  applyOperatorPrices(stations, prices, operatorConfig)
  assert.deepEqual(stations.map(station => station.prices.map(price => price.periods[0].rates[0])), [[4.25], [4.99]])
})
