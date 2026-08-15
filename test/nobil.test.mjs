import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTeslaLocationGuid, normalizeNobilDump, parsePosition, parsePowerKw } from '../scripts/providers/nobil.mjs'

test('parsePosition leser NOBIL-formatet', () => {
  assert.deepEqual(parsePosition('(59.9139,10.7522)'), { latitude: 59.9139, longitude: 10.7522 })
})

test('parsePowerKw leser oversatt NOBIL-effekt', () => {
  assert.equal(parsePowerKw('150 kW DC'), 150)
  assert.equal(parsePowerKw('62,5 kW DC'), 62.5)
  assert.equal(parsePowerKw('LBG'), null)
})

test('Tesla locationGUID leses fra NOBILs OCPI-mapping', () => {
  assert.equal(extractTeslaLocationGuid('US#TSL#335b4f24-4847-4c05-867b-792ddb08b180'), '335b4f24-4847-4c05-867b-792ddb08b180')
  assert.equal(extractTeslaLocationGuid('NO*KOP*123'), null)
  assert.equal(extractTeslaLocationGuid('NO#ION#335b4f24-4847-4c05-867b-792ddb08b180'), null)
})

test('NOBIL-dump normaliseres og personlige kildefelt utelates', () => {
  const result = normalizeNobilDump([{
    Provider: 'NOBIL',
    Rights: 'Creative Commons',
    apiver: '3',
    chargerstations: [{
      csmd: {
        id: 123, name: 'Testladeren', Position: '(59.9139,10.7522)', Street: 'Testgata',
        ocpidb_mapping_stasjon_id: 'US#TSL#335b4f24-4847-4c05-867b-792ddb08b180',
        House_number: '1', Zipcode: '0123', City: 'Oslo', Owned_by: 'Eier', Operator: 'Testoperatør',
        Number_charging_points: '4', Created_by: 'Skal ikke publiseres', Contact_info: 'Skal ikke publiseres'
      },
      attr: {
        st: { 2: { attrname: 'Availability', trans: 'Public', attrval: '' } },
        conn: { 1: {
          4: { attrname: 'Connector', trans: 'CCS/Combo', attrval: '' },
          5: { attrname: 'Charging capacity', trans: '150 kW DC', attrval: '' },
          28: { attrname: 'EVSE ID', trans: 'EVSE ID', attrval: 'NO*TEST*E1' }
        } }
      }
    }]
  }], '2026-01-01T00:00:00.000Z')

  assert.equal(result.stations.length, 1)
  assert.deepEqual(result.stats, { allFastStations: 1, publicFastStations: 1 })
  assert.equal(result.stations[0].id, 'nobil:123')
  assert.equal(result.stations[0].operator.name, 'Testoperatør')
  assert.equal(result.stations[0].accessibility, 'Public')
  assert.equal(result.stations[0].sourceIds.teslaLocationGuid, '335b4f24-4847-4c05-867b-792ddb08b180')
  assert.equal(result.stations[0].connectors[0].id, 'NO*TEST*E1')
  assert.equal(result.stations[0].connectors[0].standard, 'CCS/Combo')
  assert.equal(result.stations[0].connectors[0].maxPowerKw, 150)
  assert.equal(JSON.stringify(result).includes('Skal ikke publiseres'), false)
})

test('ikke-offentlige hurtigladere filtreres ut', () => {
  const payload = {
    chargerstations: [{
      csmd: { id: 1, name: 'Flåtelader', Position: '(59.9,10.7)' },
      attr: {
        st: { 2: { attrname: 'Availability', trans: 'Employees', attrval: '' } },
        conn: { 1: { 5: { attrname: 'Charging capacity', trans: '350 kW DC', attrval: '' } } }
      }
    }]
  }
  assert.throws(() => normalizeNobilDump(payload), /ingen gyldige stasjoner/)
})
