import { finiteNumber, nonEmptyString } from '../lib/io.mjs'

export const NOBIL_ENDPOINT = 'https://nobil.no/api/server/datadump.php'

function firstValue (value) {
  if (Array.isArray(value)) return firstValue(value[0])
  if (value && typeof value === 'object') {
    return firstValue(value.value ?? value.Value ?? value.attrval ?? value.trans ?? value.name)
  }
  return value
}

function entries (value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value)
  return []
}

function attrName (attribute) {
  return String(attribute?.attrname ?? attribute?.name ?? attribute?.key ?? '').toLowerCase()
}

function attrValue (attribute) {
  return firstValue(attribute?.attrval ?? attribute?.value ?? attribute)
}

function findAttribute (attributes, patterns) {
  const normalizedPatterns = patterns.map(pattern => pattern.toLowerCase())
  const match = entries(attributes).find(attribute => {
    const name = attrName(attribute)
    return normalizedPatterns.some(pattern => name.includes(pattern))
  })
  return match ? attrValue(match) : null
}

export function parsePosition (value) {
  if (value && typeof value === 'object') {
    const latitude = finiteNumber(value.latitude ?? value.lat)
    const longitude = finiteNumber(value.longitude ?? value.lon ?? value.lng)
    return latitude === null || longitude === null ? null : { latitude, longitude }
  }
  const match = String(value ?? '').match(/\(?\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*\)?/)
  if (!match) return null
  return { latitude: Number(match[1].replace(',', '.')), longitude: Number(match[2].replace(',', '.')) }
}

function normalizeConnector (connector, index) {
  const attributes = connector?.attr ?? connector?.attributes ?? connector
  return {
    id: nonEmptyString(connector?.id ?? connector?.connector_id) ?? String(index + 1),
    standard: nonEmptyString(findAttribute(attributes, ['connector', 'kontakttype'])),
    maxPowerKw: finiteNumber(findAttribute(attributes, ['charging capacity', 'ladeeffekt', 'capacity'])),
    chargeMode: nonEmptyString(findAttribute(attributes, ['charge mode', 'lademodus'])),
    fixedCable: nonEmptyString(findAttribute(attributes, ['fixed cable', 'fast kabel'])),
    reservable: nonEmptyString(findAttribute(attributes, ['reservable', 'reserverbar']))
  }
}

export function normalizeNobilStation (station) {
  const metadata = station?.csmd ?? station?.metadata ?? station
  const location = parsePosition(metadata?.Position ?? metadata?.position)
  const id = nonEmptyString(metadata?.id ?? metadata?.ID ?? station?.id)
  const name = nonEmptyString(metadata?.name ?? metadata?.Name)
  if (!id || !name || !location) return null

  const connectorContainer = station?.attr?.conn ?? station?.connectors ?? []
  const connectors = entries(connectorContainer)
    .map(normalizeConnector)
    .filter(connector => connector.standard || connector.maxPowerKw !== null)

  return {
    id: `nobil:${id}`,
    sourceIds: { nobil: id },
    name,
    location,
    address: {
      street: nonEmptyString(metadata?.Street),
      houseNumber: nonEmptyString(metadata?.House_number),
      postcode: nonEmptyString(metadata?.Zipcode),
      city: nonEmptyString(metadata?.City),
      municipality: nonEmptyString(metadata?.Municipality),
      county: nonEmptyString(metadata?.County),
      countryCode: nonEmptyString(metadata?.Land_code) ?? 'NOR'
    },
    operator: {
      id: null,
      name: nonEmptyString(metadata?.Owned_by)
    },
    status: nonEmptyString(metadata?.Station_status),
    totalChargePoints: finiteNumber(metadata?.Number_charging_points),
    availableChargePoints: finiteNumber(metadata?.Available_charging_points),
    connectors,
    prices: [],
    updatedAt: nonEmptyString(metadata?.Updated),
    attribution: 'NOBIL by Enova'
  }
}

export function normalizeNobilDump (payload, fetchedAt = new Date().toISOString()) {
  const envelope = Array.isArray(payload) ? payload[0] : payload
  const rawStations = envelope?.chargerstations ?? envelope?.chargingstations
  if (!rawStations) throw new Error('NOBIL-svaret mangler chargerstations')
  const stations = entries(rawStations).map(normalizeNobilStation).filter(Boolean)
  if (stations.length === 0) throw new Error('NOBIL-svaret ga ingen gyldige stasjoner')

  return {
    source: {
      id: 'nobil',
      name: 'NOBIL by Enova',
      fetchedAt,
      rights: nonEmptyString(envelope?.Rights),
      apiVersion: nonEmptyString(envelope?.apiver)
    },
    stations
  }
}

export async function fetchNobilDump ({ apiKey, fetchImpl = fetch, signal = AbortSignal.timeout(120_000) }) {
  if (!nonEmptyString(apiKey)) throw new Error('NOBIL_API_KEY mangler')
  const url = new URL(NOBIL_ENDPOINT)
  url.search = new URLSearchParams({
    apikey: apiKey,
    countrycode: 'NOR',
    format: 'json',
    file: 'false'
  })
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`NOBIL svarte HTTP ${response.status}`)
  return normalizeNobilDump(await response.json())
}

