import { resolve } from 'node:path'
import { readJson, writeJsonAtomic } from './lib/io.mjs'
import { validateDataset } from './lib/validate.mjs'
import { fetchNobilDump } from './providers/nobil.mjs'
import { fetchTeslaSite, refreshTeslaTokens } from './providers/tesla.mjs'

const root = process.cwd()
const paths = {
  nobilCache: resolve(root, 'data/cache/nobil.json'),
  teslaCache: resolve(root, 'data/cache/tesla.json'),
  teslaConfig: resolve(root, 'config/tesla-sites.json'),
  publicDataset: resolve(root, 'public/data/stations.json'),
  tokenFile: resolve(root, process.env.TESLA_TOKEN_FILE || '.secrets/tesla-tokens.json')
}

function distanceKm (first, second) {
  const radians = degrees => degrees * Math.PI / 180
  const deltaLat = radians(second.latitude - first.latitude)
  const deltaLon = radians(second.longitude - first.longitude)
  const lat1 = radians(first.latitude)
  const lat2 = radians(second.latitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isTeslaStation (station) {
  return `${station.name} ${station.operator?.name ?? ''}`.toLowerCase().includes('tesla')
}

function combine (nobil, tesla) {
  const stations = structuredClone(nobil.stations)
  for (const site of tesla?.sites ?? []) {
    let match = stations
      .filter(isTeslaStation)
      .map(station => ({ station, distance: distanceKm(station.location, site.location) }))
      .filter(candidate => candidate.distance <= 1.5)
      .sort((a, b) => a.distance - b.distance)[0]?.station

    if (match) {
      match.sourceIds.teslaLocationGuid = site.locationGuid
      match.operator = { id: 'tesla', name: match.operator?.name || 'Tesla' }
      match.prices = site.prices
    } else {
      match = {
        id: `tesla:${site.locationGuid}`,
        sourceIds: { teslaLocationGuid: site.locationGuid, teslaSiteId: site.siteId },
        name: site.name || 'Tesla Supercharger',
        location: site.location,
        address: null,
        operator: { id: 'tesla', name: 'Tesla' },
        status: null,
        totalChargePoints: site.totalStalls,
        availableChargePoints: null,
        connectors: [{ id: 'tesla', standard: 'CCS', maxPowerKw: site.maxPowerKw, chargeMode: 'DC', fixedCable: 'yes', reservable: null }],
        prices: site.prices,
        updatedAt: site.fetchedAt,
        attribution: 'Tesla'
      }
      stations.push(match)
    }
  }

  const sources = [nobil.source]
  if (tesla?.sites?.length) {
    sources.push({ id: 'tesla', name: 'Tesla', fetchedAt: tesla.fetchedAt, rights: null, apiVersion: null })
  }
  return validateDataset({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources, stations })
}

async function updateNobil () {
  const cached = await readJson(paths.nobilCache, null)
  if (!process.env.NOBIL_API_KEY) {
    if (cached) {
      console.log('NOBIL: API-nøkkel mangler, bruker lokal sist-godkjent cache.')
      return cached
    }
    throw new Error('NOBIL_API_KEY mangler og det finnes ingen lokal cache ennå')
  }
  try {
    const result = await fetchNobilDump({ apiKey: process.env.NOBIL_API_KEY })
    await writeJsonAtomic(paths.nobilCache, result)
    console.log(`NOBIL: ${result.stations.length} stasjoner validert og lagret lokalt.`)
    return result
  } catch (error) {
    if (!cached) throw error
    console.warn(`NOBIL: oppdatering feilet (${error.message}); bruker sist-godkjent cache.`)
    return cached
  }
}

async function getTeslaAccessToken () {
  const stored = await readJson(paths.tokenFile, {})
  const refreshToken = process.env.TESLA_REFRESH_TOKEN || stored.refreshToken
  if (refreshToken) {
    const refreshed = await refreshTeslaTokens({ refreshToken })
    await writeJsonAtomic(paths.tokenFile, refreshed)
    console.log('Tesla: token fornyet og lagret i ignorert lokal secrets-fil.')
    return refreshed.accessToken
  }
  return process.env.TESLA_ACCESS_TOKEN || process.env.TESLA_TOKEN || stored.accessToken || null
}

async function updateTesla () {
  const cached = await readJson(paths.teslaCache, { fetchedAt: null, sites: [] })
  let accessToken
  try {
    accessToken = await getTeslaAccessToken()
  } catch (error) {
    console.warn(`Tesla: tokenfornyelse feilet (${error.message}); bruker sist-godkjent cache.`)
    return cached
  }
  if (!accessToken) {
    console.log('Tesla: ingen lokal tokenkonfigurasjon, bruker eventuell sist-godkjent cache.')
    return cached
  }

  const config = await readJson(paths.teslaConfig)
  const previous = new Map(cached.sites.map(site => [site.locationGuid, site]))
  let successes = 0
  for (const configuredSite of config.sites.filter(site => site.enabled !== false)) {
    try {
      const site = await fetchTeslaSite({ accessToken, locationGuid: configuredSite.locationGuid })
      previous.set(site.locationGuid, site)
      successes += 1
      console.log(`Tesla: pris oppdatert for ${configuredSite.name}.`)
    } catch (error) {
      console.warn(`Tesla: beholdt tidligere data for ${configuredSite.name} (${error.message}).`)
    }
  }
  const result = { fetchedAt: successes ? new Date().toISOString() : cached.fetchedAt, sites: [...previous.values()] }
  if (successes) await writeJsonAtomic(paths.teslaCache, result)
  return result
}

async function main () {
  const nobil = await updateNobil()
  const tesla = await updateTesla()
  const dataset = combine(nobil, tesla)
  await writeJsonAtomic(paths.publicDataset, dataset)
  console.log(`Ferdig: ${dataset.stations.length} stasjoner skrevet til public/data/stations.json.`)
}

main().catch(error => {
  console.error(`Oppdatering avbrutt: ${error.message}`)
  process.exitCode = 1
})

