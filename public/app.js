const state = document.querySelector('#data-state')
document.querySelector('#year').textContent = new Date().getFullYear()

try {
  const response = await fetch('/data/stations.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  const count = Array.isArray(data.stations) ? data.stations.length : 0
  state.textContent = count > 0
    ? `${new Intl.NumberFormat('nb-NO').format(count)} stasjoner i datagrunnlaget`
    : 'Datainnsamlingen klargjøres nå'
} catch {
  state.textContent = 'Datainnsamlingen klargjøres nå'
}

