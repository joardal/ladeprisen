import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNobilDump, parsePosition } from '../scripts/providers/nobil.mjs'

test('parsePosition leser NOBIL-formatet', () => {
  assert.deepEqual(parsePosition('(59.9139,10.7522)'), { latitude: 59.9139, longitude: 10.7522 })
})

test('NOBIL-dump normaliseres og personlige kildefelt utelates', () => {
  const result = normalizeNobilDump([{
    Provider: 'NOBIL',
    Rights: 'Creative Commons',
    apiver: '3',
    chargerstations: [{
      csmd: {
        id: '123', name: 'Testladeren', Position: '(59.9139,10.7522)', Street: 'Testgata',
        House_number: '1', Zipcode: '0123', City: 'Oslo', Owned_by: 'Testoperatør',
        Number_charging_points: '4', Created_by: 'Skal ikke publiseres', Contact_info: 'Skal ikke publiseres'
      },
      attr: { conn: [{ id: '1', attr: [
        { attrname: 'Connector', attrval: 'CCS' },
        { attrname: 'Charging capacity', attrval: '150' }
      ] }] }
    }]
  }], '2026-01-01T00:00:00.000Z')

  assert.equal(result.stations.length, 1)
  assert.equal(result.stations[0].id, 'nobil:123')
  assert.equal(result.stations[0].connectors[0].standard, 'CCS')
  assert.equal(result.stations[0].connectors[0].maxPowerKw, 150)
  assert.equal(JSON.stringify(result).includes('Skal ikke publiseres'), false)
})

