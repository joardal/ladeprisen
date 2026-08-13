import { nonEmptyString } from '../lib/io.mjs'

export const TESLA_GRAPHQL_ENDPOINT = 'https://akamai-apigateway-charging-ownership.tesla.com/graphql'
export const TESLA_TOKEN_ENDPOINT = 'https://auth.tesla.com/oauth2/v3/token'

const SITE_INFORMATION_QUERY = `
query getChargingSiteInformation(
  $id: ChargingSiteIdentifierInputType!
  $vehicleMakeType: ChargingVehicleMakeTypeEnum
  $deviceCountry: String!
  $deviceLanguage: String!
) {
  charging {
    site(
      id: $id
      deviceCountry: $deviceCountry
      deviceLanguage: $deviceLanguage
      vehicleMakeType: $vehicleMakeType
    ) {
      siteStatic {
        id { text }
        locationGUID
        localizedSiteName { value }
        centroid { latitude longitude }
        maxPowerKw { value }
        publicStallCount
        siteType
        accessType
      }
      pricing(vehicleMakeType: $vehicleMakeType) {
        userRates { activePricebook { priceBookID charging {
          currencyCode programType rates buckets { start end } bucketUom
          touRates { enabled activeRatesByTime { startTime endTime rates } }
          uom vehicleMakeType dynamicRates { enabled }
        } } }
        memberRates { activePricebook { priceBookID charging {
          currencyCode programType rates buckets { start end } bucketUom
          touRates { enabled activeRatesByTime { startTime endTime rates } }
          uom vehicleMakeType dynamicRates { enabled }
        } } }
        hasMembershipPricing
        hasMSPPricing
        canDisplayCombinedComparison
      }
    }
  }
}`

function normalizePeriods (charging) {
  const timed = charging?.touRates?.activeRatesByTime
  if (charging?.touRates?.enabled && Array.isArray(timed) && timed.length > 0) {
    return timed.map(period => ({
      startTime: period.startTime ?? null,
      endTime: period.endTime ?? null,
      rates: (period.rates ?? []).filter(Number.isFinite)
    }))
  }
  return [{ startTime: null, endTime: null, rates: (charging?.rates ?? []).filter(Number.isFinite) }]
}

function normalizePrice (rate, customerType) {
  const pricebook = rate?.activePricebook
  const charging = pricebook?.charging
  if (!pricebook || !charging) return null
  return {
    provider: 'tesla',
    customerType,
    currency: charging.currencyCode ?? 'NOK',
    unit: charging.uom ?? 'kWh',
    periods: normalizePeriods(charging),
    powerBuckets: (charging.buckets ?? []).map((bucket, index) => ({
      start: bucket.start ?? null,
      end: bucket.end ?? null,
      rate: charging.rates?.[index] ?? null,
      unit: charging.bucketUom ?? null
    })),
    dynamic: charging.dynamicRates?.enabled === true,
    priceBookId: pricebook.priceBookID ?? null
  }
}

export function normalizeTeslaSite (site, fetchedAt = new Date().toISOString()) {
  const details = site?.siteStatic
  if (!details?.locationGUID || !details?.centroid) throw new Error('Tesla-svaret mangler stasjonsdetaljer')
  const prices = [
    normalizePrice(site.pricing?.userRates, 'drop-in'),
    normalizePrice(site.pricing?.memberRates, 'member')
  ].filter(Boolean)
  if (prices.length === 0) throw new Error('Tesla-svaret mangler priser')
  return {
    locationGuid: details.locationGUID,
    siteId: details.id?.text ?? null,
    name: details.localizedSiteName?.value ?? null,
    location: details.centroid,
    maxPowerKw: details.maxPowerKw?.value ?? null,
    totalStalls: details.publicStallCount ?? null,
    siteType: details.siteType ?? null,
    accessType: details.accessType ?? null,
    prices,
    fetchedAt
  }
}

export async function refreshTeslaTokens ({ refreshToken, fetchImpl = fetch, signal = AbortSignal.timeout(30_000) }) {
  if (!nonEmptyString(refreshToken)) throw new Error('Tesla refresh token mangler')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: 'ownerapi',
    scope: 'openid email offline_access',
    refresh_token: refreshToken
  })
  const response = await fetchImpl(TESLA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) throw new Error(`Tesla tokenfornyelse feilet (HTTP ${response.status})`)
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
    expiresIn: payload.expires_in ?? null,
    updatedAt: new Date().toISOString()
  }
}

export async function fetchTeslaSite ({ accessToken, locationGuid, country = 'NO', language = 'nb', fetchImpl = fetch, signal = AbortSignal.timeout(30_000) }) {
  if (!nonEmptyString(accessToken)) throw new Error('Tesla access token mangler')
  if (!nonEmptyString(locationGuid)) throw new Error('Tesla locationGUID mangler')
  const operationName = 'getChargingSiteInformation'
  const query = new URLSearchParams({
    operationName,
    deviceLanguage: language,
    deviceCountry: country,
    ttpLocale: `${language}_${country}`,
    vin: ''
  })
  const response = await fetchImpl(`${TESLA_GRAPHQL_ENDPOINT}?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'okhttp/4.11.0',
      'x-tesla-user-agent': 'TeslaApp/4.44.5-3304/3a5d531cc3/android/27',
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      operationName,
      query: SITE_INFORMATION_QUERY,
      variables: {
        id: { id: locationGuid, type: 'LOCATION_GUID' },
        vehicleMakeType: 'NON_TESLA',
        deviceCountry: country,
        deviceLanguage: language
      }
    }),
    signal
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Tesla svarte HTTP ${response.status}`)
  if (payload?.errors?.length) throw new Error('Tesla returnerte en GraphQL-feil')
  const site = payload?.data?.charging?.site
  if (!site) throw new Error('Tesla returnerte ingen stasjon')
  return normalizeTeslaSite(site)
}

