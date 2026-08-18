const number = new Intl.NumberFormat('nb-NO')
const priceNumber = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const elements = {
  comparison: document.querySelector('.city-comparison'),
  eyebrow: document.querySelector('#city-price-eyebrow'),
  priceRange: document.querySelector('#city-price-range'),
  teslaList: document.querySelector('#city-tesla-list'),
  otherList: document.querySelector('#city-other-list'),
  insight: document.querySelector('#city-price-insight'),
  mapLink: document.querySelector('#city-map-link'),
  timeButtons: [...document.querySelectorAll('[data-price-time]')],
  timeStatus: document.querySelector('#city-price-time-status')
}

let cityData = null
let priceTimeMode = new URLSearchParams(window.location.search).get('tid') === '23' ? 'late' : 'now'

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character])
}

function osloMinutes (now = new Date()) {
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now)
  const value = type => Number(parts.find(part => part.type === type)?.value)
  return value('hour') * 60 + value('minute')
}

function selectedPriceMinutes () {
  return priceTimeMode === 'late' ? 23 * 60 + 30 : osloMinutes()
}

function activePeriod (period, current = selectedPriceMinutes()) {
  if (!period?.startTime || !period?.endTime) return true
  const minutes = value => {
    const [hours, mins] = value.split(':').map(Number)
    return hours * 60 + mins
  }
  const start = minutes(period.startTime)
  const end = minutes(period.endTime)
  if (start === end) return true
  return start < end ? current >= start && current < end : current >= start || current < end
}

function currentPriceFor (station, customerTypes) {
  const candidates = []
  for (const price of station.prices ?? []) {
    if (!customerTypes.includes(price.customerType)) continue
    for (const period of price.periods ?? []) {
      if (!activePeriod(period)) continue
      for (const amount of period.rates ?? []) {
        if (Number.isFinite(amount)) candidates.push({ amount, details: price })
      }
    }
  }
  return candidates.sort((first, second) => first.amount - second.amount)[0] ?? null
}

function driverPrice (station, driver) {
  const dropIn = currentPriceFor(station, ['drop-in'])
  if (driver === 'tesla' && station.operator?.id === 'tesla') {
    return currentPriceFor(station, ['tesla-vehicle']) ?? dropIn
  }
  return dropIn
}

function rankedStations (driver) {
  return cityData.stations
    .map(station => ({ ...station, displayPrice: driverPrice(station, driver) }))
    .filter(station => station.displayPrice)
    .sort((first, second) => first.displayPrice.amount - second.displayPrice.amount || first.distance - second.distance)
}

function addressLabel (station) {
  const street = [station.address?.street, station.address?.houseNumber].filter(Boolean).join(' ')
  return [street, station.address?.city].filter(Boolean).join(', ') || 'Adresse ikke oppgitt'
}

function distanceLabel (distance) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toLocaleString('nb-NO', { maximumFractionDigits: distance < 10 ? 1 : 0 })} km`
}

function navigationUrl (station) {
  return `https://www.google.com/maps/dir/?api=1&destination=${station.location.latitude},${station.location.longitude}`
}

function priceContext (station, driver) {
  if (station.operator?.id !== 'tesla') return 'Drop-in-pris'
  return driver === 'tesla' ? 'Tesla-bilpris' : 'Pris for andre biler'
}

function stationList (stations, driver) {
  if (!stations.length) return '<li class="city-empty">Ingen offentlig pris funnet i området.</li>'
  return stations.slice(0, 3).map((station, index) => `<li class="city-station">
    <span class="city-rank">${index + 1}</span>
    <div class="city-station-copy">
      <span class="city-operator">${escapeHtml(station.operator?.name || 'Ukjent operatør')}</span>
      <strong>${escapeHtml(station.name)}</strong>
      <small>${escapeHtml(addressLabel(station))} · ${escapeHtml(distanceLabel(station.distance))}</small>
      <span class="city-tags"><i>${number.format(station.maxPower)} kW</i><i>${priceContext(station, driver)}</i></span>
    </div>
    <div class="city-price"><strong>${priceNumber.format(station.displayPrice.amount)}</strong><span>kr/kWh</span></div>
    <a href="${navigationUrl(station)}" target="_blank" rel="noreferrer" aria-label="Naviger til ${escapeHtml(station.name)}">Naviger ↗</a>
  </li>`).join('')
}

function updateTimeUi () {
  for (const button of elements.timeButtons) {
    const active = button.dataset.priceTime === priceTimeMode
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  }
  const late = priceTimeMode === 'late'
  elements.eyebrow.textContent = late ? 'Billigst etter kl. 23' : 'Billigst akkurat nå'
  elements.timeStatus.textContent = late
    ? 'Viser priser som gjelder kl. 23.30.'
    : 'Prisene følger klokkeslettet i Norge og oppdateres automatisk.'
  const mapUrl = new URL(elements.mapLink.href)
  if (late) mapUrl.searchParams.set('tid', '23')
  else mapUrl.searchParams.delete('tid')
  elements.mapLink.href = mapUrl
}

function render () {
  if (!cityData) return
  const tesla = rankedStations('tesla')
  const other = rankedStations('other')
  elements.teslaList.innerHTML = stationList(tesla, 'tesla')
  elements.otherList.innerHTML = stationList(other, 'other')

  const amounts = other.map(station => station.displayPrice.amount)
  const cheapest = amounts.length ? Math.min(...amounts) : null
  const mostExpensive = amounts.length ? Math.max(...amounts) : null
  elements.priceRange.textContent = cheapest === null
    ? 'Pris ikke offentlig tilgjengelig'
    : `${priceNumber.format(cheapest)}–${priceNumber.format(mostExpensive)} kr/kWh`

  const difference = cheapest && mostExpensive ? Math.round((mostExpensive - cheapest) / cheapest * 100) : 0
  elements.insight.hidden = difference <= 0
  elements.insight.innerHTML = `Dyreste kjente drop-in-pris innenfor ${number.format(cityData.radiusKm)} km er <strong>${number.format(difference)} % høyere</strong> enn den billigste.`
}

function setPriceTimeMode (mode) {
  priceTimeMode = mode === 'late' ? 'late' : 'now'
  const url = new URL(window.location.href)
  if (priceTimeMode === 'late') url.searchParams.set('tid', '23')
  else url.searchParams.delete('tid')
  history.replaceState(null, '', url)
  updateTimeUi()
  render()
}

async function initialize () {
  updateTimeUi()
  try {
    const response = await fetch('./data.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    cityData = await response.json()
    render()
  } catch (error) {
    console.error('Kunne ikke oppdatere tidsstyrte bypriser', error)
  }
}

for (const button of elements.timeButtons) {
  button.addEventListener('click', () => setPriceTimeMode(button.dataset.priceTime))
}

initialize()

setInterval(() => {
  if (priceTimeMode === 'now') render()
}, 60_000)
