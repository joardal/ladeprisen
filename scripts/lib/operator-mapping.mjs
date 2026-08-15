export function normalizedName (value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function includesAlias (value, alias) {
  return ` ${normalizedName(value)} `.includes(` ${normalizedName(alias)} `)
}

export function findOperator (station, operatorConfig) {
  return operatorConfig.operators.find(operator => operator.aliases.some(alias => includesAlias(station.name, alias))) ??
    operatorConfig.operators.find(operator => operator.aliases.some(alias => includesAlias(station.operator?.name, alias))) ??
    null
}

function maxStationPowerKw (station) {
  const powers = (station.connectors ?? []).map(connector => connector.maxPowerKw).filter(Number.isFinite)
  return powers.length ? Math.max(...powers) : null
}

function matchesPower (sourceRate, stationPowerKw) {
  if (stationPowerKw === null || !sourceRate.power) return true
  const minimum = sourceRate.power.minKw
  const maximum = sourceRate.power.maxKw
  return (!Number.isFinite(minimum) || stationPowerKw >= minimum) &&
    (!Number.isFinite(maximum) || stationPowerKw <= maximum)
}

function stationRegion (station) {
  const county = normalizedName(station.address?.county)
  if (['more og romsdal', 'trondelag', 'nordland', 'troms', 'finnmark'].includes(county)) return 'north-central'
  return county ? 'south' : null
}

function matchesRegion (sourceRate, station) {
  if (!sourceRate.region || sourceRate.region === 'highest-national') return true
  const region = stationRegion(station)
  return !region || sourceRate.region === region
}

export function applyOperatorPrices (stations, operatorDataset, operatorConfig) {
  const pricesById = new Map(operatorDataset.operators.map(operator => [operator.id, operator]))
  for (const station of stations) {
    const operator = findOperator(station, operatorConfig)
    if (!operator) continue
    station.operator = { id: operator.id, name: operator.name }
    const source = pricesById.get(operator.id)
    if (!source?.rates?.length || operator.id === 'tesla') continue
    const stationPowerKw = maxStationPowerKw(station)
    station.prices = source.rates
      .filter(sourceRate => matchesPower(sourceRate, stationPowerKw) && matchesRegion(sourceRate, station))
      .map(sourceRate => ({
      provider: operator.id,
      customerType: sourceRate.customerType,
      currency: sourceRate.currency,
      unit: sourceRate.unit,
      label: sourceRate.label,
      periods: [{
        startTime: sourceRate.time?.startTime ?? null,
        endTime: sourceRate.time?.endTime ?? null,
        rates: [sourceRate.amount]
      }],
      power: sourceRate.power,
      monthlyFee: sourceRate.monthlyFee,
      region: sourceRate.region,
      sourceUrl: source.sourceUrl,
      sourceStatus: source.status,
      sourceUpdatedAt: source.sourceUpdatedAt ?? null,
      fetchedAt: source.fetchedAt,
      stale: source.status === 'stale'
      }))
  }
  return stations
}
