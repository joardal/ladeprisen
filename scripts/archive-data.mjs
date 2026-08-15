import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { validateDataset } from './lib/validate.mjs'
import { validateOperatorPrices } from './lib/validate-operator-prices.mjs'

const gzipAsync = promisify(gzip)
const root = process.cwd()
const sourceFiles = [
  { name: 'stations', path: resolve(root, 'public/data/stations.json'), validate: validateDataset },
  { name: 'operator-prices', path: resolve(root, 'public/data/operator-prices.json'), validate: validateOperatorPrices }
]

function archiveStamp (date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function main () {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const directory = resolve(root, 'data/history', day)
  await mkdir(directory, { recursive: true })

  for (const source of sourceFiles) {
    const raw = await readFile(source.path, 'utf8')
    source.validate(JSON.parse(raw))
    const target = resolve(directory, `${archiveStamp(now)}-${source.name}.json.gz`)
    await writeFile(target, await gzipAsync(raw, { level: 9 }), { flag: 'wx' })
    console.log(`Arkivert: ${target}`)
  }
}

main().catch(error => {
  console.error(`Arkivering avbrutt: ${error.message}`)
  process.exitCode = 1
})
