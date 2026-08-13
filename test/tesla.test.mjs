import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchTeslaSite, normalizeTeslaSite, refreshTeslaTokens, TESLA_TOKEN_ENDPOINT } from '../scripts/providers/tesla.mjs'

const rawSite = {
  siteStatic: {
    id: { text: '16844' }, locationGUID: '335b4f24-4847-4c05-867b-792ddb08b180',
    localizedSiteName: { value: 'Sentrum P-Hus' }, centroid: { latitude: 59.91, longitude: 10.75 },
    maxPowerKw: { value: 250 }, publicStallCount: 12
  },
  pricing: {
    userRates: { activePricebook: { priceBookID: 'public', charging: { currencyCode: 'NOK', uom: 'kWh', rates: [4.1], touRates: { enabled: false } } } },
    memberRates: { activePricebook: { priceBookID: 'member', charging: { currencyCode: 'NOK', uom: 'kWh', rates: [2.9], touRates: { enabled: false } } } }
  }
}

test('Tesla-priser normaliseres for drop-in og medlem', () => {
  const result = normalizeTeslaSite(rawSite, '2026-01-01T00:00:00.000Z')
  assert.equal(result.prices[0].customerType, 'drop-in')
  assert.deepEqual(result.prices[0].periods[0].rates, [4.1])
  assert.equal(result.prices[1].customerType, 'member')
})

test('tokenfornyelse sender form-data og beholder rotert token', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 28800 }), { status: 200 })
  }
  const result = await refreshTeslaTokens({ refreshToken: 'old-refresh', fetchImpl, signal: undefined })
  assert.equal(request.url, TESLA_TOKEN_ENDPOINT)
  assert.equal(request.options.body.get('grant_type'), 'refresh_token')
  assert.equal(request.options.body.get('refresh_token'), 'old-refresh')
  assert.equal(result.refreshToken, 'new-refresh')
})

test('Tesla-kallet bruker bearer-token uten å legge det i URL eller feilmelding', async () => {
  const secret = 'extremely-secret-token'
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ data: { charging: { site: rawSite } } }), { status: 200 })
  }
  const result = await fetchTeslaSite({ accessToken: secret, locationGuid: rawSite.siteStatic.locationGUID, fetchImpl, signal: undefined })
  assert.equal(result.siteId, '16844')
  assert.equal(request.url.includes(secret), false)
  assert.equal(request.options.headers.Authorization, `Bearer ${secret}`)
})

