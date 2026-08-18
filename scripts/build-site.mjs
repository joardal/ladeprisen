import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readJson } from './lib/io.mjs'
import { validateDataset } from './lib/validate.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'
import { buildCityModel } from './lib/city-pages.mjs'
import { renderCityIndex, renderCityPage, renderSitemap } from './templates/city-page.mjs'

const root = process.cwd()
const publicDirectory = resolve(root, 'public')
const outputDirectory = resolve(root, 'dist')
const dataset = validateDataset(await readJson(resolve(publicDirectory, 'data/stations.json')))
const operatorPrices = validateOperatorPrices(await readJson(resolve(publicDirectory, 'data/operator-prices.json')))
const cityConfig = await readJson(resolve(root, 'config/cities.json'))
const siteUrl = (process.env.SITE_URL || 'https://ladeprisen.no').replace(/\/$/, '')

if (!Number.isFinite(cityConfig.radiusKm) || cityConfig.radiusKm <= 0) throw new Error('config/cities.json mangler gyldig radiusKm')
if (!Array.isArray(cityConfig.cities) || cityConfig.cities.length === 0) throw new Error('config/cities.json mangler byer')
const citySlugs = new Set()
for (const city of cityConfig.cities) {
  if (!city.slug || !city.name || !Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) throw new Error(`Ugyldig bykonfigurasjon: ${city.name || city.slug || 'ukjent'}`)
  if (citySlugs.has(city.slug)) throw new Error(`Duplikat by-slug: ${city.slug}`)
  citySlugs.add(city.slug)
}

const cityModels = cityConfig.cities
  .map(city => buildCityModel({ city, cities: cityConfig.cities, stations: dataset.stations, radiusKm: cityConfig.radiusKm, generatedAt: dataset.generatedAt }))
  .filter(model => {
    if (model.pricedStationCount >= 3) return true
    console.warn(`Byside utelatt: ${model.name} har færre enn tre stasjoner med offentlig pris.`)
    return false
  })

const cityDirectory = resolve(publicDirectory, 'ladepriser')
await rm(cityDirectory, { recursive: true, force: true })
await mkdir(cityDirectory, { recursive: true })
await writeFile(resolve(cityDirectory, 'index.html'), renderCityIndex(cityModels, siteUrl), 'utf8')
for (const model of cityModels) {
  const directory = resolve(cityDirectory, model.slug)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'index.html'), renderCityPage(model, siteUrl), 'utf8')
}
await writeFile(resolve(publicDirectory, 'sitemap.xml'), renderSitemap(cityModels, siteUrl, dataset.generatedAt), 'utf8')
await writeFile(resolve(publicDirectory, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8')

const rootIndexPath = resolve(publicDirectory, 'index.html')
const rootIndex = await readFile(rootIndexPath, 'utf8')
const seoBlock = `<!-- build:seo --><link rel="canonical" href="${siteUrl}/">\n    <meta property="og:type" content="website">\n    <meta property="og:site_name" content="Ladeprisen">\n    <meta property="og:url" content="${siteUrl}/"><!-- /build:seo -->`
await writeFile(rootIndexPath, rootIndex.replace(/<!-- build:seo -->[\s\S]*?<!-- \/build:seo -->/, seoBlock), 'utf8')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(publicDirectory, outputDirectory, { recursive: true })

console.log(`Bygget dist/ med ${dataset.stations.length} stasjoner, ${operatorPrices.operators.length} operatører og ${cityModels.length} bysider.`)
