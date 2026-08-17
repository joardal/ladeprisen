import * as L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js'

const number = new Intl.NumberFormat('nb-NO')
const priceNumber = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' })
const elements = {
  state: document.querySelector('#data-state'),
  total: document.querySelector('#total-stations'),
  placeForm: document.querySelector('#place-form'),
  placeSearch: document.querySelector('#place-search'),
  heroLocate: document.querySelector('#hero-locate-button'),
  nearbyRadius: document.querySelector('#nearby-radius'),
  nearbyPower: document.querySelector('#nearby-power'),
  areaStatus: document.querySelector('#area-status'),
  teslaNearby: document.querySelector('#tesla-nearby-list'),
  otherNearby: document.querySelector('#other-nearby-list'),
  priceGap: document.querySelector('#price-gap'),
  search: document.querySelector('#search'),
  power: document.querySelector('#power-filter'),
  sort: document.querySelector('#sort-order'),
  pricedOnly: document.querySelector('#priced-only'),
  resultCount: document.querySelector('#result-count'),
  list: document.querySelector('#station-list'),
  locate: document.querySelector('#locate-button'),
  reset: document.querySelector('#reset-filters'),
  message: document.querySelector('#map-message')
}

document.querySelector('#year').textContent = new Date().getFullYear()

const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false,
  minZoom: 3,
  maxBounds: [[54, -2], [72.5, 35]],
  maxBoundsViscosity: 0.65
}).setView([64.5, 11], 5)

L.control.zoom({ position: 'bottomright' }).addTo(map)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map)

const markerLayer = L.layerGroup().addTo(map)
const markerById = new Map()
let stations = []
let selectedStationId = null
let userLocation = null
let userMarker = null
let renderFrame = null

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character])
}

function normalized (value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9æøå]+/g, ' ').trim()
}

function titleCase (value) {
  return String(value ?? '').toLocaleLowerCase('nb-NO').replace(/(^|[\s-])\p{L}/gu, letter => letter.toLocaleUpperCase('nb-NO'))
}

function maxPower (station) {
  return Math.max(0, ...(station.connectors ?? []).map(connector => connector.maxPowerKw ?? 0))
}

function activePeriod (period, now = new Date()) {
  if (!period?.startTime || !period?.endTime) return true
  const minutes = value => {
    const [hours, mins] = value.split(':').map(Number)
    return hours * 60 + mins
  }
  const current = now.getHours() * 60 + now.getMinutes()
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
  return candidates.sort((a, b) => a.amount - b.amount)[0] ?? null
}

function currentDropInPrice (station) {
  return currentPriceFor(station, ['drop-in'])
}

function driverPrice (station, driver) {
  if (driver === 'tesla' && station.operator?.id === 'tesla') {
    return currentPriceFor(station, ['tesla-vehicle']) ?? station._price
  }
  return station._price
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

function distanceLabel (distance) {
  if (!Number.isFinite(distance)) return ''
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toLocaleString('nb-NO', { maximumFractionDigits: distance < 10 ? 1 : 0 })} km`
}

function markerColor (price) {
  if (!price) return '#81908a'
  if (price.amount < 5) return '#138a5b'
  if (price.amount < 6) return '#e6a119'
  return '#d85b3f'
}

function addressLabel (station) {
  const street = [station.address?.street, station.address?.houseNumber].filter(Boolean).join(' ')
  const city = titleCase(station.address?.city)
  return [street, city].filter(Boolean).join(', ') || 'Adresse ikke oppgitt'
}

function availabilityLabel (station) {
  if (!station.hasRealtimeData || !Number.isFinite(station.availableChargePoints)) return null
  return `${station.availableChargePoints} ledige nå`
}

function navigationUrl (station) {
  return `https://www.google.com/maps/dir/?api=1&destination=${station.location.latitude},${station.location.longitude}`
}

function preparedStations () {
  const query = normalized(elements.search.value)
  const minimumPower = Number(elements.power.value)
  const onlyPriced = elements.pricedOnly.checked
  const filtered = stations.filter(station => {
    if (station._maxPower < minimumPower) return false
    if (onlyPriced && !station._displayPrice) return false
    if (!query) return true
    return station._search.includes(query)
  })

  const sortOrder = elements.sort.value
  filtered.sort((first, second) => {
    if (sortOrder === 'distance') {
      return (first._distance ?? Infinity) - (second._distance ?? Infinity) || (first._price?.amount ?? Infinity) - (second._price?.amount ?? Infinity)
    }
    if (sortOrder === 'power') return second._maxPower - first._maxPower
    return (first._price?.amount ?? Infinity) - (second._price?.amount ?? Infinity) || (first._distance ?? Infinity) - (second._distance ?? Infinity) || first.name.localeCompare(second.name, 'nb')
  })
  return filtered
}

function stationCard (station) {
  const price = station._displayPrice
  const availability = availabilityLabel(station)
  const fallback = price?.details.sourceStatus === 'fallback'
  return `
    <article class="station-card${station.id === selectedStationId ? ' selected' : ''}" data-station-id="${escapeHtml(station.id)}">
      <button class="station-main" type="button" data-select-station="${escapeHtml(station.id)}">
        <span class="station-topline">
          <span class="operator-name">${escapeHtml(station.operator?.name || 'Ukjent operatør')}</span>
          ${station._distance !== null ? `<span>${escapeHtml(distanceLabel(station._distance))}</span>` : ''}
        </span>
        <span class="station-body">
          <span>
            <strong>${escapeHtml(station.name)}</strong>
            <small>${escapeHtml(addressLabel(station))}</small>
          </span>
          <span class="price-block ${price ? '' : 'missing'}">
            <b>${price ? priceNumber.format(price.amount) : '–'}</b>
            <small>${price ? 'kr/kWh' : 'Pris ikke offentlig tilgjengelig'}</small>
          </span>
        </span>
        <span class="station-meta">
          <span>${number.format(station._maxPower)} kW</span>
          ${Number.isFinite(station.totalChargePoints) ? `<span>${number.format(station.totalChargePoints)} ladepunkt</span>` : ''}
          ${availability ? `<span class="available">${escapeHtml(availability)}</span>` : ''}
          ${fallback ? '<span class="fallback">Kontrollpris</span>' : ''}
        </span>
      </button>
      <a class="navigate-link" href="${navigationUrl(station)}" target="_blank" rel="noreferrer">Naviger <span aria-hidden="true">↗</span></a>
    </article>`
}

function popupContent (station) {
  const price = station._displayPrice
  return `<div class="station-popup">
    <span>${escapeHtml(station.operator?.name || 'Ukjent operatør')}</span>
    <strong>${escapeHtml(station.name)}</strong>
    <small>${escapeHtml(addressLabel(station))}</small>
    <div><b>${price ? `${priceNumber.format(price.amount)} kr/kWh` : 'Pris ikke offentlig tilgjengelig'}</b><span>${number.format(station._maxPower)} kW</span></div>
    <a href="${navigationUrl(station)}" target="_blank" rel="noreferrer">Få veibeskrivelse ↗</a>
  </div>`
}

function selectStation (station, { moveMap = true } = {}) {
  selectedStationId = station.id
  renderList(preparedStations())
  const marker = markerById.get(station.id)
  if (marker) {
    if (moveMap) map.setView([station.location.latitude, station.location.longitude], Math.max(map.getZoom(), 13), { animate: true })
    marker.bindPopup(popupContent(station), { maxWidth: 300 }).openPopup()
  }
  requestAnimationFrame(() => document.querySelector(`[data-station-id="${CSS.escape(station.id)}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function renderList (filtered) {
  const limit = 60
  elements.resultCount.textContent = `${number.format(filtered.length)} ${filtered.length === 1 ? 'stasjon' : 'stasjoner'}`
  elements.list.setAttribute('aria-busy', 'false')
  if (!filtered.length) {
    elements.list.innerHTML = '<div class="empty-state"><strong>Ingen treff</strong><p>Prøv et annet sted eller fjern ett av filtrene.</p></div>'
    return
  }
  elements.list.innerHTML = filtered.slice(0, limit).map(stationCard).join('') +
    (filtered.length > limit ? `<p class="list-limit">Viser de første ${limit}. Bruk søk eller posisjon for å snevre inn.</p>` : '')
}

function renderMarkers (filtered) {
  markerLayer.clearLayers()
  markerById.clear()
  for (const station of filtered) {
    const marker = L.circleMarker([station.location.latitude, station.location.longitude], {
      radius: station.id === selectedStationId ? 9 : 6,
      color: '#ffffff',
      weight: 2,
      fillColor: markerColor(station._price),
      fillOpacity: 0.92
    })
    marker.on('click', () => selectStation(station, { moveMap: false }))
    marker.addTo(markerLayer)
    markerById.set(station.id, marker)
  }
}

function render () {
  const filtered = preparedStations()
  renderList(filtered)
  renderMarkers(filtered)
}

function scheduleRender () {
  cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(render)
}

function showMessage (message) {
  elements.message.textContent = message
  elements.message.hidden = false
  clearTimeout(showMessage.timeout)
  showMessage.timeout = setTimeout(() => { elements.message.hidden = true }, 5000)
}

function nearbyItem (station, driver, rank) {
  const price = driverPrice(station, driver)
  return `<li>
    <button type="button" data-quick-station="${escapeHtml(station.id)}">
      <span class="nearby-rank">${rank}</span>
      <span class="nearby-station"><strong>${escapeHtml(station.name)}</strong><small>${escapeHtml(station.operator?.name || 'Ukjent operatør')} · ${escapeHtml(distanceLabel(station._distance))}</small></span>
      <span class="nearby-price"><strong>${priceNumber.format(price.amount)}</strong><small>kr/kWh</small></span>
    </button>
    <a href="${navigationUrl(station)}" target="_blank" rel="noreferrer" aria-label="Naviger til ${escapeHtml(station.name)}">↗</a>
  </li>`
}

function renderNearby () {
  if (!userLocation) return
  const radius = Number(elements.nearbyRadius.value)
  const minimumPower = Number(elements.nearbyPower.value)
  const nearby = stations.filter(station => station._distance <= radius && station._maxPower >= minimumPower)
  const ranked = driver => nearby
    .map(station => ({ station, price: driverPrice(station, driver) }))
    .filter(candidate => candidate.price)
    .sort((first, second) => first.price.amount - second.price.amount || first.station._distance - second.station._distance)
    .slice(0, 3)

  const tesla = ranked('tesla')
  const other = ranked('other')
  const empty = '<li class="nearby-placeholder">Ingen offentlig pris funnet i valgt radius.</li>'
  elements.teslaNearby.innerHTML = tesla.length ? tesla.map((entry, index) => nearbyItem(entry.station, 'tesla', index + 1)).join('') : empty
  elements.otherNearby.innerHTML = other.length ? other.map((entry, index) => nearbyItem(entry.station, 'other', index + 1)).join('') : empty

  const known = nearby.map(station => station._price?.amount).filter(Number.isFinite)
  if (known.length >= 2) {
    const cheapest = Math.min(...known)
    const mostExpensive = Math.max(...known)
    const difference = Math.round((mostExpensive - cheapest) / cheapest * 100)
    elements.priceGap.textContent = `Dyreste kjente drop-in-pris i området er ${number.format(difference)} % høyere enn den billigste.`
    elements.priceGap.hidden = difference <= 0
  } else {
    elements.priceGap.hidden = true
  }
}

function setUserLocation (location, label) {
  userLocation = location
  for (const station of stations) station._distance = distanceKm(userLocation, station.location)
  elements.sort.value = 'distance'
  userMarker?.remove()
  userMarker = L.circleMarker([userLocation.latitude, userLocation.longitude], {
    radius: 9, color: '#ffffff', weight: 3, fillColor: '#1479ff', fillOpacity: 1
  }).bindTooltip(label).addTo(map)
  map.setView([userLocation.latitude, userLocation.longitude], 10, { animate: true })
  elements.areaStatus.textContent = `Viser priser innenfor ${elements.nearbyRadius.value} km fra ${label}.`
  renderNearby()
  render()
}

function setLocateBusy (busy) {
  elements.locate.disabled = busy
  elements.heroLocate.disabled = busy
  elements.locate.lastChild.textContent = busy ? ' Finner deg …' : ' Min posisjon'
  elements.heroLocate.lastChild.textContent = busy ? ' Finner deg …' : ' Bruk min posisjon'
}

function locateUser ({ silent = false } = {}) {
  if (!navigator.geolocation) {
    if (!silent) showMessage('Nettleseren støtter ikke posisjonstjenester.')
    return
  }
  if (!window.isSecureContext) {
    if (!silent) showMessage('Posisjon krever en sikker HTTPS-forbindelse.')
    return
  }
  setLocateBusy(true)
  navigator.geolocation.getCurrentPosition(position => {
    setLocateBusy(false)
    setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }, 'din posisjon')
  }, error => {
    setLocateBusy(false)
    const messages = {
      1: 'Posisjonstilgang er avslått. Tillat posisjon for denne nettsiden i nettleserens innstillinger, og prøv igjen.',
      2: 'Posisjonen er ikke tilgjengelig akkurat nå. Kontroller at stedstjenester er slått på, og prøv igjen.',
      3: 'Det tok for lang tid å finne posisjonen. Prøv igjen eller søk etter et sted.'
    }
    if (!silent) showMessage(messages[error.code] || 'Klarte ikke å finne posisjonen din.')
  }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 })
}

function locateUserAutomatically () {
  if (!navigator.geolocation || !window.isSecureContext) return
  locateUser({ silent: true })
}

function findPlace (query) {
  const wanted = normalized(query)
  if (!wanted) return null
  const fields = station => [station.address?.city, station.address?.municipality, station.address?.county].map(normalized).filter(Boolean)
  let matches = stations.filter(station => fields(station).some(value => value === wanted))
  if (!matches.length) matches = stations.filter(station => fields(station).some(value => value.includes(wanted)))
  if (!matches.length) return null
  const latitude = matches.reduce((sum, station) => sum + station.location.latitude, 0) / matches.length
  const longitude = matches.reduce((sum, station) => sum + station.location.longitude, 0) / matches.length
  const exactLabel = [matches[0].address?.city, matches[0].address?.municipality, matches[0].address?.county]
    .find(value => normalized(value) === wanted)
  return { location: { latitude, longitude }, label: titleCase(exactLabel || query) }
}

async function initialize () {
  try {
    const [stationResponse, priceResponse] = await Promise.all([
      fetch('/data/stations.json', { cache: 'no-store' }),
      fetch('/data/operator-prices.json', { cache: 'no-store' })
    ])
    if (!stationResponse.ok || !priceResponse.ok) throw new Error('Datakilde er utilgjengelig')
    const [dataset, priceDataset] = await Promise.all([stationResponse.json(), priceResponse.json()])
    const sourceStatuses = new Map((priceDataset.operators ?? []).map(operator => [operator.id, operator.status]))
    stations = (dataset.stations ?? []).map(station => {
      for (const price of station.prices ?? []) price.sourceStatus ??= sourceStatuses.get(price.provider) ?? null
      const stationPrice = currentDropInPrice(station)
      return {
        ...station,
        _maxPower: maxPower(station),
        _price: stationPrice,
        _displayPrice: stationPrice,
        _distance: null,
        _search: normalized([station.name, station.operator?.name, station.address?.city, station.address?.municipality, station.address?.county].join(' '))
      }
    })
    elements.total.textContent = number.format(dataset.stats?.allFastStations ?? stations.length)
    elements.state.textContent = `Oppdatert ${dateTime.format(new Date(dataset.generatedAt))}`
    render()
    const requestedPlace = new URLSearchParams(window.location.search).get('sted')
    if (requestedPlace) {
      elements.placeSearch.value = requestedPlace
      const place = findPlace(requestedPlace)
      if (place) setUserLocation(place.location, place.label)
    } else {
      locateUserAutomatically()
    }
  } catch (error) {
    console.error(error)
    elements.state.textContent = 'Data kunne ikke lastes'
    elements.resultCount.textContent = 'Kunne ikke laste stasjoner'
    elements.list.innerHTML = '<div class="empty-state"><strong>Noe gikk galt</strong><p>Prøv å laste siden på nytt.</p></div>'
    elements.list.setAttribute('aria-busy', 'false')
    showMessage('Ladestasjonsdata kunne ikke lastes.')
  }
}

elements.search.addEventListener('input', scheduleRender)
elements.power.addEventListener('change', render)
elements.sort.addEventListener('change', () => {
  if (elements.sort.value === 'distance' && !userLocation) {
    showMessage('Bruk «Min posisjon» for å sortere etter avstand.')
    elements.sort.value = 'price'
  }
  render()
})
elements.pricedOnly.addEventListener('change', render)
elements.locate.addEventListener('click', () => locateUser())
elements.heroLocate.addEventListener('click', () => locateUser())
elements.nearbyRadius.addEventListener('change', () => {
  if (!userLocation) return
  const label = elements.areaStatus.textContent.match(/fra (.+)\.$/)?.[1] || 'valgt sted'
  elements.areaStatus.textContent = `Viser priser innenfor ${elements.nearbyRadius.value} km fra ${label}.`
  renderNearby()
})
elements.nearbyPower.addEventListener('change', renderNearby)
elements.placeForm.addEventListener('submit', event => {
  event.preventDefault()
  const place = findPlace(elements.placeSearch.value)
  if (!place) {
    showMessage('Fant ikke stedet. Prøv by, kommune eller fylke.')
    return
  }
  setUserLocation(place.location, place.label)
})
elements.reset.addEventListener('click', () => {
  elements.search.value = ''
  elements.power.value = '50'
  elements.sort.value = userLocation ? 'distance' : 'price'
  elements.pricedOnly.checked = false
  render()
})
elements.list.addEventListener('click', event => {
  const button = event.target.closest('[data-select-station]')
  if (!button) return
  const station = stations.find(candidate => candidate.id === button.dataset.selectStation)
  if (station) selectStation(station)
})
document.querySelector('.quick-compare').addEventListener('click', event => {
  const button = event.target.closest('[data-quick-station]')
  if (!button) return
  const station = stations.find(candidate => candidate.id === button.dataset.quickStation)
  if (station) {
    selectStation(station)
    document.querySelector('.explorer').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

initialize()
