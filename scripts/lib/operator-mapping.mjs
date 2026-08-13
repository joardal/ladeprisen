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

export function applyOperatorPrices (stations, operatorDataset, operatorConfig) {
  const pricesById = new Map(operatorDataset.operators.map(operator => [operator.id, operator]))
  for (const station of stations) {
    const operator = findOperator(station, operatorConfig)
    if (!operator) continue
    station.operator = { id: operator.id, name: operator.name }
    const source = pricesById.get(operator.id)
    if (!source?.rates?.length || operator.id === 'tesla') continue
    station.prices = source.rates.map(sourceRate => ({
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
      sourceUpdatedAt: source.sourceUpdatedAt ?? null,
      fetchedAt: source.fetchedAt,
      stale: source.status === 'stale'
    }))
  }
  return stations
}
