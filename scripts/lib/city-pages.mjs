export function distanceKm (first, second) {
  const radians = degrees => degrees * Math.PI / 180
  const deltaLat = radians(second.latitude - first.latitude)
  const deltaLon = radians(second.longitude - first.longitude)
  const lat1 = radians(first.latitude)
  const lat2 = radians(second.latitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function osloMinutes (date = new Date()) {
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date)
  const value = type => Number(parts.find(part => part.type === type)?.value)
  return value('hour') * 60 + value('minute')
}

function activePeriod (period, date = new Date()) {
  if (!period?.startTime || !period?.endTime) return true
  const minutes = value => {
    const [hours, mins] = value.split(':').map(Number)
    return hours * 60 + mins
  }
  const current = osloMinutes(date)
  const start = minutes(period.startTime)
  const end = minutes(period.endTime)
  if (start === end) return true
  return start < end ? current >= start && current < end : current >= start || current < end
}

export function currentPriceFor (station, customerTypes, date = new Date()) {
  const candidates = []
  for (const price of station.prices ?? []) {
    if (!customerTypes.includes(price.customerType)) continue
    for (const period of price.periods ?? []) {
      if (!activePeriod(period, date)) continue
      for (const amount of period.rates ?? []) {
        if (Number.isFinite(amount)) candidates.push({ amount, details: price })
      }
    }
  }
  return candidates.sort((first, second) => first.amount - second.amount)[0] ?? null
}

function driverPrice (station, driver, date) {
  const dropIn = currentPriceFor(station, ['drop-in'], date)
  if (driver === 'tesla' && station.operator?.id === 'tesla') {
    return currentPriceFor(station, ['tesla-vehicle'], date) ?? dropIn
  }
  return dropIn
}

function maxPower (station) {
  return Math.max(0, ...(station.connectors ?? []).map(connector => connector.maxPowerKw ?? 0))
}

function rankedStations (stations, driver, date) {
  return stations
    .map(station => ({ ...station, displayPrice: driverPrice(station, driver, date) }))
    .filter(station => station.displayPrice)
    .sort((first, second) => first.displayPrice.amount - second.displayPrice.amount || first.distance - second.distance)
}

export function buildCityModel ({ city, cities, stations, radiusKm, generatedAt, now = new Date() }) {
  const center = { latitude: city.latitude, longitude: city.longitude }
  const localStations = stations
    .map(station => ({ ...station, distance: distanceKm(center, station.location), maxPower: maxPower(station) }))
    .filter(station => station.distance <= radiusKm)
  const otherRanked = rankedStations(localStations, 'other', now)
  const teslaRanked = rankedStations(localStations, 'tesla', now)
  const dropInAmounts = otherRanked.map(station => station.displayPrice.amount)
  const cheapest = dropInAmounts.length ? Math.min(...dropInAmounts) : null
  const mostExpensive = dropInAmounts.length ? Math.max(...dropInAmounts) : null
  const priceDifference = cheapest && mostExpensive
    ? Math.round((mostExpensive - cheapest) / cheapest * 100)
    : null
  const operatorCounts = new Map()
  for (const station of localStations) {
    const name = station.operator?.name || 'Ukjent operatør'
    operatorCounts.set(name, (operatorCounts.get(name) ?? 0) + 1)
  }
  const operators = [...operatorCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, 'nb'))
  const nearbyCities = cities
    .filter(candidate => candidate.slug !== city.slug)
    .map(candidate => ({ ...candidate, distance: distanceKm(center, candidate) }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4)

  return {
    ...city,
    radiusKm,
    generatedAt,
    stationCount: localStations.length,
    pricedStationCount: otherRanked.length,
    teslaTop: teslaRanked.slice(0, 3),
    otherTop: otherRanked.slice(0, 3),
    cheapest,
    mostExpensive,
    priceDifference,
    operators,
    nearbyCities
  }
}
