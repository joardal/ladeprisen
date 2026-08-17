const number = new Intl.NumberFormat('nb-NO')
const priceNumber = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const updatedDate = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'long' })

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character])
}

function absoluteUrl (siteUrl, path) {
  return `${siteUrl.replace(/\/$/, '')}${path}`
}

function addressLabel (station) {
  const street = [station.address?.street, station.address?.houseNumber].filter(Boolean).join(' ')
  const city = station.address?.city
  return [street, city].filter(Boolean).join(', ') || 'Adresse ikke oppgitt'
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
  return stations.map((station, index) => `<li class="city-station">
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

function pageShell ({ title, description, canonical, body, siteUrl }) {
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="theme-color" content="#0b251d">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Ladeprisen">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/city-pages.css">
  </head>
  <body>
    <header class="city-topbar">
      <a class="city-brand" href="/" aria-label="Ladeprisen forsiden"><span>L</span>Ladeprisen</a>
      <a href="/ladepriser/">Ladepriser per by</a>
    </header>
    ${body}
    <footer class="city-footer"><span>© ${new Date().getFullYear()} Ladeprisen</span><span>Stasjonsdata: <a href="https://info.nobil.no/">NOBIL / Enova</a> · <a href="${siteUrl}">Finn ladere i hele Norge</a></span></footer>
  </body>
</html>`
}

export function renderCityPage (model, siteUrl) {
  const title = `Billigste ladestasjon i ${model.name} i dag | Ladeprisen`
  const description = `Finn billigste ladestasjon og elbillader i ${model.name}. Sammenlign dagens ladepriser innenfor ${model.radiusKm} km, med effekt, avstand og navigasjon.`
  const canonical = absoluteUrl(siteUrl, `/ladepriser/${model.slug}/`)
  const priceRange = model.cheapest === null
    ? 'Pris ikke offentlig tilgjengelig'
    : `${priceNumber.format(model.cheapest)}–${priceNumber.format(model.mostExpensive)} kr/kWh`
  const body = `<main class="city-main">
    <nav class="breadcrumbs" aria-label="Brødsmuler"><a href="/">Forside</a><span>›</span><a href="/ladepriser/">Ladepriser</a><span>›</span><span>${escapeHtml(model.name)}</span></nav>
    <section class="city-hero">
      <p class="city-eyebrow">Ladepriser oppdatert daglig</p>
      <h1>Billigste ladestasjon <em>i ${escapeHtml(model.name)}</em></h1>
      <p>Sammenlign pris på hurtiglading og elbilladere innenfor ${model.radiusKm} km fra ${escapeHtml(model.name)} sentrum. Prisene er kontrollert ${escapeHtml(updatedDate.format(new Date(model.generatedAt)))}.</p>
      <div class="city-facts">
        <div><strong>${number.format(model.stationCount)}</strong><span>hurtigladestasjoner</span></div>
        <div><strong>${number.format(model.radiusKm)} km</strong><span>fra sentrum</span></div>
        <div><strong>${escapeHtml(priceRange)}</strong><span>kjent drop-in-pris</span></div>
      </div>
    </section>
    <section class="city-comparison" aria-labelledby="comparison-title">
      <div class="city-section-head"><div><p class="city-eyebrow">Billigst akkurat nå</p><h2 id="comparison-title">Ladepriser i ${escapeHtml(model.name)}</h2></div><a class="city-map-link" href="/?sted=${encodeURIComponent(model.name)}">Åpne interaktivt kart →</a></div>
      <div class="city-lists">
        <article><div class="city-list-title"><span>T</span><div><h3>For Tesla-eiere</h3><p>Tesla-pris på Tesla-ladere, vanlig drop-in-pris på andre ladere</p></div></div><ol>${stationList(model.teslaTop, 'tesla')}</ol></article>
        <article><div class="city-list-title"><span class="other">↗</span><div><h3>For andre biler</h3><p>Inkluderer Tesla-stasjoner med egen pris for andre biler</p></div></div><ol>${stationList(model.otherTop, 'other')}</ol></article>
      </div>
      ${model.priceDifference > 0 ? `<p class="city-insight">Dyreste kjente drop-in-pris innenfor ${model.radiusKm} km er <strong>${number.format(model.priceDifference)} % høyere</strong> enn den billigste.</p>` : ''}
    </section>
    <section class="city-details">
      <div><p class="city-eyebrow">Lokalt ladenettverk</p><h2>Hurtigladere i ${escapeHtml(model.name)}</h2><p>Oversikten omfatter ladere på minst 50 kW. Pris kan endres før neste daglige kontroll, så kontroller alltid beløpet hos operatøren før lading.</p><div class="operator-list">${model.operators.map(operator => `<span>${escapeHtml(operator.name)} <b>${operator.count}</b></span>`).join('')}</div></div>
      <aside><h3>Ladepriser i nærheten</h3><ul>${model.nearbyCities.map(city => `<li><a href="/ladepriser/${city.slug}/"><span>${escapeHtml(city.name)}</span><small>${distanceLabel(city.distance)} unna</small></a></li>`).join('')}</ul></aside>
    </section>
  </main>`
  return pageShell({ title, description, canonical, body, siteUrl })
}

export function renderCityIndex (models, siteUrl) {
  const title = 'Ladepriser og ladestasjoner i norske byer | Ladeprisen'
  const description = 'Finn billigste ladestasjon og elbillader i norske byer. Sammenlign oppdaterte ladepriser for Tesla og andre elbiler innenfor 10 km fra sentrum.'
  const canonical = absoluteUrl(siteUrl, '/ladepriser/')
  const cards = models.map(model => `<li><a href="/ladepriser/${model.slug}/"><span><strong>${escapeHtml(model.name)}</strong><small>${number.format(model.stationCount)} hurtigladestasjoner innenfor ${model.radiusKm} km</small></span><span>${model.cheapest === null ? 'Ukjent pris' : `fra ${priceNumber.format(model.cheapest)} kr/kWh`} →</span></a></li>`).join('')
  const body = `<main class="city-main city-index">
    <nav class="breadcrumbs" aria-label="Brødsmuler"><a href="/">Forside</a><span>›</span><span>Ladepriser</span></nav>
    <section class="city-hero"><p class="city-eyebrow">Lokale ladepriser</p><h1>Finn billigste ladestasjon <em>der du er</em></h1><p>Velg en by og se dagens rimeligste elbilladere innenfor 10 km fra sentrum. Alle sidene oppdateres fra samme kontrollerte prisgrunnlag.</p></section>
    <section class="city-directory" aria-labelledby="city-list-title"><h2 id="city-list-title">Ladepriser i ${models.length} norske byer</h2><ul>${cards}</ul></section>
  </main>`
  return pageShell({ title, description, canonical, body, siteUrl })
}

export function renderSitemap (models, siteUrl, generatedAt) {
  const date = new Date(generatedAt).toISOString().slice(0, 10)
  const paths = ['/', '/ladepriser/', ...models.map(model => `/ladepriser/${model.slug}/`)]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path => `  <url><loc>${escapeHtml(absoluteUrl(siteUrl, path))}</loc><lastmod>${date}</lastmod></url>`).join('\n')}\n</urlset>\n`
}
