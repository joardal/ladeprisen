const state = document.querySelector('#data-state')
document.querySelector('#year').textContent = new Date().getFullYear()

try {
  const [stationsResponse, pricesResponse] = await Promise.all([
    fetch('/data/stations.json', { cache: 'no-store' }),
    fetch('/data/operator-prices.json', { cache: 'no-store' })
  ])
  if (!stationsResponse.ok || !pricesResponse.ok) throw new Error('Datakilde er utilgjengelig')
  const [stations, prices] = await Promise.all([stationsResponse.json(), pricesResponse.json()])
  const stationCount = Array.isArray(stations.stations) ? stations.stations.length : 0
  const sourceCount = Array.isArray(prices.operators)
    ? prices.operators.filter(operator => operator.status === 'current').length
    : 0
  state.textContent = stationCount > 0
    ? `${new Intl.NumberFormat('nb-NO').format(stationCount)} stasjoner · ${sourceCount} priskilder`
    : sourceCount > 0
      ? `${sourceCount} offisielle priskilder overvåkes`
      : 'Datainnsamlingen klargjøres nå'
} catch {
  state.textContent = 'Datainnsamlingen klargjøres nå'
}
