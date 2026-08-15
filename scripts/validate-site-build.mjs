import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(process.cwd(), 'dist')

async function filesBelow (directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(path))
    else result.push(path)
  }
  return result
}

function internalTarget (href) {
  const clean = href.split(/[?#]/)[0]
  let target = join(root, ...clean.split('/').filter(Boolean))
  if (!extname(target)) target = join(target, 'index.html')
  return target
}

const htmlFiles = (await filesBelow(root)).filter(path => path.endsWith('.html'))
const cityFiles = htmlFiles.filter(path => path.includes(`${sep}ladepriser${sep}`))
const titles = new Set()
const descriptions = new Set()
const canonicals = new Set()
const brokenLinks = []

for (const file of cityFiles) {
  const html = await readFile(file, 'utf8')
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1]
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1]
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  if (!title || !description || !canonical) throw new Error(`${relative(root, file)} mangler SEO-metadata`)
  titles.add(title)
  descriptions.add(description)
  canonicals.add(canonical)
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1]
    if (!href.startsWith('/') || href.startsWith('//')) continue
    if (!existsSync(internalTarget(href))) brokenLinks.push(`${relative(root, file)} -> ${href}`)
  }
}

const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8')
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])
const rootHtml = await readFile(join(root, 'index.html'), 'utf8')

if (cityFiles.length !== 31) throw new Error(`Forventet byoversikt og 30 bysider, fant ${cityFiles.length} HTML-filer`)
if (titles.size !== cityFiles.length) throw new Error('Bysidene har dupliserte titler')
if (descriptions.size !== cityFiles.length) throw new Error('Bysidene har dupliserte metabeskrivelser')
if (canonicals.size !== cityFiles.length) throw new Error('Bysidene har dupliserte canonical-adresser')
if (sitemapUrls.length !== 32) throw new Error(`Forventet 32 adresser i sitemap, fant ${sitemapUrls.length}`)
if (!/<link rel="canonical"/.test(rootHtml)) throw new Error('Forsiden mangler canonical i produksjonsbygget')
if (brokenLinks.length) throw new Error(`Fant brutte internlenker:\n${brokenLinks.join('\n')}`)

console.log(`Gyldig nettsted: 30 bysider, unike metadata, ${sitemapUrls.length} sitemap-adresser og ingen brutte internlenker.`)
