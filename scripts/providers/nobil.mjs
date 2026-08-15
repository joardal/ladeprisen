import { finiteNumber, nonEmptyString } from '../lib/io.mjs'

export const NOBIL_ENDPOINT = 'https://nobil.no/api/server/datadump.php'
export const MIN_FAST_CHARGE_POWER_KW = 50

function stringValue (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return nonEmptyString(value)
}

function decodeEntities (value) {
  return nonEmptyString(value)
    ?.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>') ?? null
}

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
  const direct = firstValue(attribute?.attrval ?? attribute?.value)
  if (direct !== null && direct !== undefined && direct !== '') return direct
  return firstValue(attribute?.trans ?? attribute)
}

function findAttribute (attributes, patterns) {
  const normalizedPatterns = patterns.map(pattern => pattern.toLowerCase())
  const match = entries(attributes).find(attribute => {
    const name = attrName(attribute)
    return normalizedPatterns.some(pattern => name.includes(pattern))
  })
  return match ? attrValue(match) : null
}

export function parsePowerKw (value) {
  const direct = finiteNumber(value)
  if (direct !== null) return direct
  const match = String(value ?? '').match(/(-?\d+(?:[.,]\d+)?)\s*k\s*w/i)
  return match ? Number(match[1].replace(',', '.')) : null
}

function parseNobilDate (value) {
  const normalized = nonEmptyString(value)?.replace(' ', 'T')
  if (!normalized) return null
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`
  const timestamp = Date.parse(withTimezone)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : nonEmptyString(value)
}

export function extractTeslaLocationGuid (value) {
  const match = String(value ?? '').match(/^US#TSL#([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
  return match?.[1]?.toLowerCase() ?? null
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
  const energyCarrier = nonEmptyString(findAttribute(attributes, ['energy carrier', 'energibærer']))
  if (energyCarrier && !/electric/i.test(energyCarrier)) return null

  const evseId = stringValue(findAttribute(attributes, ['evse id']))
  const connectorId = stringValue(findAttribute(attributes, ['connector id']))
  return {
    id: evseId ?? connectorId ?? stringValue(connector?.id ?? connector?.connector_id) ?? String(index + 1),
    standard: nonEmptyString(findAttribute(attributes, ['connector', 'kontakttype'])),
    maxPowerKw: parsePowerKw(findAttribute(attributes, ['charging capacity', 'ladeeffekt', 'capacity'])),
    chargeMode: nonEmptyString(findAttribute(attributes, ['charge mode', 'lademodus'])),
    fixedCable: nonEmptyString(findAttribute(attributes, ['fixed cable', 'fast kabel'])),
    reservable: nonEmptyString(findAttribute(attributes, ['reservable', 'reserverbar']))
  }
}

export function normalizeNobilStation (station) {
  const metadata = station?.csmd ?? station?.metadata ?? station
  const stationAttributes = station?.attr?.st ?? station?.attributes ?? []
  const location = parsePosition(metadata?.Position ?? metadata?.position)
  const id = stringValue(metadata?.id ?? metadata?.ID ?? station?.id)
  const name = decodeEntities(metadata?.name ?? metadata?.Name)
  if (!id || !name || !location) return null

  const connectorContainer = station?.attr?.conn ?? station?.connectors ?? []
  const connectors = entries(connectorContainer)
    .map(normalizeConnector)
    .filter(Boolean)
    .filter(connector => connector.standard || connector.maxPowerKw !== null)
  const realtimeValue = String(findAttribute(stationAttributes, ['real-time information', 'sanntidsinformasjon']) ?? '')
  const hasRealtimeData = /^(?:1|yes|true|ja)$/i.test(realtimeValue)
  const accessibility = nonEmptyString(findAttribute(stationAttributes, ['availability', 'tilgjengelighet']))
  const teslaLocationGuid = extractTeslaLocationGuid(metadata?.ocpidb_mapping_stasjon_id)

  return {
    id: `nobil:${id}`,
    sourceIds: {
      nobil: id,
      ...(teslaLocationGuid ? { teslaLocationGuid } : {})
    },
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
      name: decodeEntities(metadata?.Operator) ?? decodeEntities(metadata?.Owned_by)
    },
    status: stringValue(metadata?.Station_status),
    totalChargePoints: finiteNumber(metadata?.Number_charging_points),
    availableChargePoints: hasRealtimeData ? finiteNumber(metadata?.Available_charging_points) : null,
    hasRealtimeData,
    accessibility,
    connectors,
    prices: [],
    updatedAt: parseNobilDate(metadata?.Updated),
    attribution: 'NOBIL by Enova'
  }
}

export function normalizeNobilDump (payload, fetchedAt = new Date().toISOString(), { minPowerKw = MIN_FAST_CHARGE_POWER_KW, publicOnly = true } = {}) {
  const envelope = Array.isArray(payload) ? payload[0] : payload
  const rawStations = envelope?.chargerstations ?? envelope?.chargingstations
  if (!rawStations) throw new Error('NOBIL-svaret mangler chargerstations')
  const fastStations = entries(rawStations)
    .map(normalizeNobilStation)
    .filter(Boolean)
    .filter(station => station.connectors.some(connector => connector.maxPowerKw >= minPowerKw))
  const stations = fastStations.filter(station => !publicOnly || station.accessibility?.toLowerCase() === 'public')
  if (stations.length === 0) throw new Error('NOBIL-svaret ga ingen gyldige stasjoner')

  return {
    source: {
      id: 'nobil',
      name: 'NOBIL by Enova',
      fetchedAt,
      rights: nonEmptyString(envelope?.Rights),
      apiVersion: nonEmptyString(envelope?.apiver)
    },
    stats: {
      allFastStations: fastStations.length,
      publicFastStations: stations.length
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
