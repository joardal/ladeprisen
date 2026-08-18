import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCityModel, currentPriceFor, distanceKm } from '../scripts/lib/city-pages.mjs'
import { renderCityPage } from '../scripts/templates/city-page.mjs'

function price (customerType, amount) {
  return { provider: 'test', customerType, currency: 'NOK', unit: 'kWh', periods: [{ startTime: null, endTime: null, rates: [amount] }] }
}

function station ({ id, longitude, operatorId = 'test', prices = [] }) {
  return {
    id, name: `Stasjon ${id}`, location: { latitude: 59.91, longitude }, address: { city: 'Testby' },
    operator: { id: operatorId, name: operatorId === 'tesla' ? 'Tesla' : 'Testlading' },
    connectors: [{ maxPowerKw: 150 }], prices
  }
}

test('bymodellen bruker 10 km radius og egne Tesla-priser', () => {
  const city = { slug: 'testby', name: 'Testby', latitude: 59.91, longitude: 10.75 }
  const stations = [
    station({ id: 'tesla', longitude: 10.76, operatorId: 'tesla', prices: [price('drop-in', 6), price('tesla-vehicle', 4)] }),
    station({ id: 'a', longitude: 10.77, prices: [price('drop-in', 5)] }),
    station({ id: 'b', longitude: 10.78, prices: [price('drop-in', 5.5)] }),
    station({ id: 'utenfor', longitude: 11.5, prices: [price('drop-in', 1)] })
  ]
  const model = buildCityModel({ city, cities: [city], stations, radiusKm: 10, generatedAt: '2026-08-15T10:00:00.000Z' })
  assert.equal(model.stationCount, 3)
  assert.equal(model.teslaTop[0].id, 'tesla')
  assert.equal(model.teslaTop[0].displayPrice.amount, 4)
  assert.equal(model.otherTop[0].id, 'a')
  assert.equal(model.cheapest, 5)
  assert.ok(distanceKm(city, stations[0].location) < 10)
  assert.equal(currentPriceFor(stations[0], ['drop-in']).amount, 6)
})

test('byside-malen har lokal metadata, canonical og ingen kjent-pris-dekning', () => {
  const city = { slug: 'testby', name: 'Testby', latitude: 59.91, longitude: 10.75 }
  const model = buildCityModel({
    city, cities: [city], radiusKm: 10, generatedAt: '2026-08-15T10:00:00.000Z',
    stations: [station({ id: 'a', longitude: 10.76, prices: [price('drop-in', 5)] })]
  })
  const html = renderCityPage(model, 'https://example.no')
  assert.match(html, /Billigste ladestasjon i Testby i dag/)
  assert.match(html, /elbillader i Testby/)
  assert.match(html, /rel="canonical" href="https:\/\/example\.no\/ladepriser\/testby\/"/)
  assert.match(html, /10 km.*fra sentrum/s)
  assert.match(html, /data-price-time="now"/)
  assert.match(html, /Etter kl\. 23/)
  assert.match(html, /src="\/city-page\.js"/)
  assert.doesNotMatch(html, /med offentlig pris/)
})

test('bymodellen beholder lokale stasjoner for prisvalg i nettleseren', () => {
  const city = { slug: 'testby', name: 'Testby', latitude: 59.91, longitude: 10.75 }
  const model = buildCityModel({
    city, cities: [city], radiusKm: 10, generatedAt: '2026-08-15T10:00:00.000Z',
    stations: [station({ id: 'a', longitude: 10.76, prices: [price('drop-in', 5)] })]
  })
  assert.equal(model.stations.length, 1)
  assert.equal(model.stations[0].id, 'a')
  assert.ok(Number.isFinite(model.stations[0].distance))
})
