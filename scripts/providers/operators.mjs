const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'nb-NO,nb;q=0.9,en;q=0.7',
  'User-Agent': 'Ladeprisen/0.1 (+https://ladepris.pages.dev)'
}

function decodeHtml (value) {
  const entities = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    ndash: '–', mdash: '—', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å'
  }
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name] ?? match)
}

export function htmlToText (html) {
  return decodeHtml(String(html))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function amount (value) {
  const parsed = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 20) throw new Error(`Uventet prisverdi: ${value}`)
  return parsed
}

function capture (text, pattern, label) {
  const match = text.match(pattern)
  if (!match) throw new Error(`Fant ikke ${label}`)
  return amount(match[1])
}

function rate ({ customerType = 'drop-in', label, value, minKw = 50, maxKw = null, startTime = null, endTime = null, monthlyFee = null, region = null }) {
  return {
    customerType,
    label,
    amount: value,
    currency: 'NOK',
    unit: 'kWh',
    power: { minKw, maxKw },
    time: startTime || endTime ? { startTime, endTime } : null,
    monthlyFee,
    region
  }
}

export function parseCircleK (html) {
  const text = htmlToText(html)
  const section = text.match(/Lyn og hurtiglading([\s\S]{0,700}?)Normallading/i)?.[1] ?? text
  return [
    rate({ label: 'Drop-in hurtig- og lynlading', value: capture(section, /Drop-in:?\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kW[ht]/i, 'Circle K drop-in-pris') }),
    rate({ customerType: 'registered', label: 'Circle K EXTRA', value: capture(section, /Registrert i Circle K extra\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kW[ht]/i, 'Circle K EXTRA-pris') })
  ]
}

export function parseEviny (html) {
  const text = htmlToText(html)
  return [rate({ label: 'Hurtig- og lynlading', value: capture(text, /Hurtiglading\s*\/\s*lynlading:\s*NOK\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Eviny hurtigladepris') })]
}

export function parseIonity (html) {
  const text = htmlToText(html)
  const norway = text.match(/Norway\s+([\s\S]*?)\s+Poland\b/i)?.[1]
  if (!norway) throw new Error('Fant ikke Norge i IONITY-prislisten')
  return [
    rate({ label: 'IONITY Direct', value: capture(norway, /([0-9]+[.,][0-9]{1,2})\s*NOK\s*\/\s*kWh\s*direct-kwh-price/i, 'IONITY Direct-pris'), minKw: 150 }),
    rate({ customerType: 'registered', label: 'IONITY Go (app)', value: capture(norway, /([0-9]+[.,][0-9]{1,2})\s*NOK\s*\/\s*kWh\s*go-kwh-price/i, 'IONITY Go-pris'), minKw: 150 })
  ]
}

export function parseIshavsveien (html) {
  const text = htmlToText(html)
  return [
    rate({ label: 'Hurtiglading 50–120 kW', value: capture(text, /Hurtiglading\s+50\s*[-–]\s*120\s*kW\s+([0-9]+[.,][0-9]{1,2})\s*kr\s*pr\s*kWh/i, 'Ishavsveien hurtigladepris'), minKw: 50, maxKw: 120 }),
    rate({ label: 'Lynlading over 150 kW', value: capture(text, /Lynlading\s*>?\s*150\s*kW\s+([0-9]+[.,][0-9]{1,2})\s*kr\s*pr\s*kWh/i, 'Ishavsveien lynladepris'), minKw: 150 })
  ]
}

export function parseKople (html) {
  const text = htmlToText(html)
  const section = text.match(/Lyn- og hurtiglading([\s\S]{0,650}?)Semi-hurtig lading/i)?.[1]
  if (!section) throw new Error('Fant ikke Koples hurtigladeseksjon')
  const night = capture(section, /Nattpris\s+fra\s+00\s*[-–]\s*06:\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Kople nattpris')
  return [
    rate({ label: 'Drop-in dagpris', value: capture(section, /Drop-in:\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Kople drop-in-pris'), startTime: '06:00', endTime: '00:00' }),
    rate({ customerType: 'registered', label: 'Kople app/RFID dagpris', value: capture(section, /Kople app\s*\/\s*RFID:\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Kople registrert pris'), startTime: '06:00', endTime: '00:00' }),
    rate({ label: 'Nattpris', value: night, startTime: '00:00', endTime: '06:00' }),
    rate({ customerType: 'registered', label: 'Nattpris', value: night, startTime: '00:00', endTime: '06:00' })
  ]
}

export function parseLadOpp (html) {
  const text = htmlToText(html)
  return [rate({ label: 'Lyn- og hurtiglading', value: capture(text, /LYN\s*&\s*HURTIG[\s\S]{0,160}?([0-9]+[.,][0-9]{1,2})\s*\/\s*kWh/i, 'Lad Opp hurtigladepris'), minKw: 75 })]
}

export function parseMer (html) {
  const text = htmlToText(html)
  return [rate({ label: 'Hurtig- og lynlading', value: capture(text, /Hurtig- og lynlading\s*\(\s*50\s*[-–]\s*400\s*kW\s*\)\s*([0-9]+[.,][0-9]{1,2})\s*kr\s*per\s*kWh/i, 'Mer hurtigladepris') })]
}

export function parseRecharge (html) {
  const text = htmlToText(html)
  return [
    rate({ label: 'Drop-in', value: capture(text, /Drop-in[\s\S]{0,180}?Kr\s*([0-9]+[.,][0-9]{1,2})\s*\/\s*kW[ht]/i, 'Recharge drop-in-pris') }),
    rate({ customerType: 'subscription', label: 'Recharge MOVE', value: capture(text, /Recharge MOVE[\s\S]{0,180}?Kr\s*([0-9]+[.,][0-9]{1,2})\s*\/\s*kW[ht]/i, 'Recharge MOVE-pris'), monthlyFee: 69 })
  ]
}

export function parseRagdeCharge (html) {
  const text = htmlToText(html)
  const section = text.match(/Priser for Lynlading([\s\S]{0,500}?)Priser for Destinasjonslad/i)?.[1]
  if (!section) throw new Error('Fant ikke Ragde Charges lynladeseksjon')
  return [
    rate({ label: 'Lynlading Sør-Norge', value: capture(section, /Oslo\s*&\s*Sør-Norge\s+fra\s+([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Ragde Charge Sør-Norge'), minKw: 150, region: 'south' }),
    rate({ label: 'Lynlading Nord- og Midt-Norge', value: capture(section, /Nord\s*&\s*Midt Norge\s+fra\s+([0-9]+[.,][0-9]{1,2})\s*kr\s*\/\s*kWh/i, 'Ragde Charge Nord/Midt'), minKw: 150, region: 'north-central' })
  ]
}

export function parsePorsche (html) {
  const decoded = decodeHtml(String(html))
  const embeddedRows = [...decoded.matchAll(/"name":\[0,"Norge"\][\s\S]{0,700}?"defaultCountry":\[0,true\],"basicFee":\[0,"([^"]+)"\],"ac":\[0,"([^"]+)"\],"dc":\[0,"([^"]+)"\],"preferred":\[0,"([^"]+)"\],"blockingFee"/gi)]
  const chargingService = embeddedRows.find(match => /^0[,.]00\s+NOK$/i.test(match[1]) && /^n\/a$/i.test(match[4]))
  const rendered = htmlToText(html).match(/Norge\s+0[.,]00\s*NOK\s+[0-9]+[.,][0-9]{2}\s*NOK\s+([0-9]+[.,][0-9]{2})\s*NOK\s+n\/a/i)
  const dcPrice = chargingService?.[3]?.match(/^([0-9]+[.,][0-9]{2})\s+NOK$/i)?.[1] ?? rendered?.[1]
  if (!dcPrice) throw new Error('Fant ikke norsk DC-pris uten fast gebyr i Porsche Charging Service-prislisten')
  return [rate({
    label: 'Porsche Charging Service – DC',
    value: amount(dcPrice),
    minKw: 50,
    monthlyFee: null
  })]
}

export const ELBIL_REFERENCE_SOURCE = {
  url: 'https://e.infogram.com/c6d0de48-c7d8-4442-9cef-14891837833b?src=embed',
  pageUrl: 'https://elbil.no/dette-koster-hurtiglading/'
}

function cellValue (cell) {
  return typeof cell === 'string' || typeof cell === 'number' ? String(cell) : cell?.value == null ? null : String(cell.value)
}

function findOperatorTable (node) {
  if (Array.isArray(node)) {
    const firstCell = cellValue(node?.[0]?.[0])
    if (firstCell === 'Operatør') return node
    for (const item of node) {
      const found = findOperatorTable(item)
      if (found) return found
    }
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findOperatorTable(value)
      if (found) return found
    }
  }
  return null
}

export function parseElbilReference (html) {
  const match = String(html).match(/window\.infographicData=({[\s\S]*?});<\/script>/)
  if (!match) throw new Error('Fant ikke Elbilforeningens Infogram-data')
  const payload = JSON.parse(match[1])
  const table = findOperatorTable(payload)
  if (!table) throw new Error('Fant ikke pristabellen i Elbilforeningens Infogram')
  const prices = {}
  for (const row of table.slice(1)) {
    const name = cellValue(row?.[0])?.trim()
    const rawPrice = cellValue(row?.[1])?.trim()
    if (!name || !rawPrice) continue
    prices[name] = amount(rawPrice)
  }
  if (Object.keys(prices).length < 8) throw new Error('Elbilforeningens pristabell var uventet kort')
  return { prices, sourceUpdatedAt: payload.updatedAt ?? null }
}

export async function fetchElbilReference ({ fetchImpl = fetch, signal = AbortSignal.timeout(30_000) } = {}) {
  const response = await fetchImpl(ELBIL_REFERENCE_SOURCE.url, { headers: DEFAULT_HEADERS, redirect: 'follow', signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseElbilReference(await response.text())
}

export const OPERATOR_SOURCES = [
  { id: 'circle-k', name: 'Circle K', url: 'https://www.circlek.no/lading/ladepriser', parse: parseCircleK },
  { id: 'eviny', name: 'Eviny', url: 'https://hurtiglading.eviny.no/', parse: parseEviny },
  { id: 'ionity', name: 'IONITY', url: 'https://www.ionity.eu/subscriptions', parse: parseIonity },
  { id: 'ishavsveien', name: 'Ishavsveien', url: 'https://www.ishavsveien.no/priser/', parse: parseIshavsveien },
  { id: 'kople', name: 'Kople', url: 'https://www.kople.no/veiledning/ladepris', parse: parseKople },
  { id: 'lad-opp', name: 'Lad Opp', url: 'https://ladopp.no/betaling/', parse: parseLadOpp },
  { id: 'mer', name: 'Mer', url: 'https://no.mer.eco/ladenettverk/priser/', parse: parseMer },
  { id: 'porsche', name: 'Porsche', url: 'https://ask.porsche.com/no/no-NO/charging-service-price-list/?q=&tab=charging-service', parse: parsePorsche },
  { id: 'ragde-charge', name: 'Ragde Charge', url: 'https://ragde.no/charge/', parse: parseRagdeCharge },
  { id: 'recharge', name: 'Recharge', url: 'https://rechargeinfra.com/no/', parse: parseRecharge }
]

export const MANUAL_OPERATOR_SOURCES = [
  { id: 'tesla', name: 'Tesla', sourceUrl: 'https://www.tesla.com/no_no/findus/list/superchargers/Norway', reason: 'Prisene hentes per stasjon fra Tesla-adapteren.' }
]

export const FALLBACK_OPERATOR_SOURCES = [
  { id: 'eon-clever', name: 'E.ON Drive & Clever', referenceName: 'E.ON Drive & Clever' },
  { id: 'uno-x', name: 'Uno-X', referenceName: 'Uno-X' }
]

export async function fetchOperatorSource (source, { fetchImpl = fetch, signal = AbortSignal.timeout(30_000) } = {}) {
  const response = await fetchImpl(source.url, { headers: DEFAULT_HEADERS, redirect: 'follow', signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  if (html.length < 500) throw new Error('Kildesiden var uventet kort')
  const rates = source.parse(html)
  if (!Array.isArray(rates) || rates.length === 0) throw new Error('Ingen priser ble lest')
  return {
    id: source.id,
    name: source.name,
    status: 'current',
    sourceUrl: response.url || source.url,
    fetchedAt: new Date().toISOString(),
    rates
  }
}
