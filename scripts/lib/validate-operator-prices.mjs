function assert (condition, message) {
  if (!condition) throw new Error(`Ugyldige operatørpriser: ${message}`)
}

export function validateOperatorPrices (dataset) {
  assert(dataset?.schemaVersion === 1, 'schemaVersion må være 1')
  assert(dataset.generatedAt === null || Number.isFinite(Date.parse(dataset.generatedAt)), 'generatedAt er ugyldig')
  assert(Array.isArray(dataset.operators), 'operators må være en liste')
  const ids = new Set()
  for (const operator of dataset.operators) {
    assert(typeof operator.id === 'string' && operator.id, 'operatør-ID mangler')
    assert(!ids.has(operator.id), `duplikat operatør-ID ${operator.id}`)
    ids.add(operator.id)
    assert(['current', 'fallback', 'stale', 'manual'].includes(operator.status), `${operator.id} har ugyldig status`)
    assert(typeof operator.sourceUrl === 'string' && operator.sourceUrl.startsWith('https://'), `${operator.id} mangler kilde-URL`)
    if (operator.status !== 'manual') {
      assert(Array.isArray(operator.rates) && operator.rates.length > 0, `${operator.id} mangler priser`)
      for (const price of operator.rates) {
        assert(Number.isFinite(price.amount) && price.amount >= 0.5 && price.amount <= 20, `${operator.id} har urimelig pris`)
        assert(price.currency === 'NOK' && price.unit === 'kWh', `${operator.id} har ukjent valuta/enhet`)
      }
    }
  }
  return dataset
}
