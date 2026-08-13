const ALLOWED_CUSTOMER_TYPES = new Set(['drop-in', 'registered', 'member', 'subscription', 'tesla-vehicle', 'unknown'])

function assert (condition, message) {
  if (!condition) throw new Error(`Ugyldig datasett: ${message}`)
}

function validIsoDate (value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function validateDataset (dataset) {
  assert(dataset && typeof dataset === 'object', 'roten må være et objekt')
  assert(dataset.schemaVersion === 1, 'schemaVersion må være 1')
  assert(dataset.generatedAt === null || validIsoDate(dataset.generatedAt), 'generatedAt må være ISO-dato eller null')
  assert(Array.isArray(dataset.sources), 'sources må være en liste')
  assert(Array.isArray(dataset.stations), 'stations må være en liste')

  const ids = new Set()
  for (const [index, station] of dataset.stations.entries()) {
    const prefix = `stations[${index}]`
    assert(typeof station.id === 'string' && station.id.length > 0, `${prefix}.id mangler`)
    assert(!ids.has(station.id), `${prefix}.id er duplikat (${station.id})`)
    ids.add(station.id)
    assert(typeof station.name === 'string' && station.name.length > 0, `${prefix}.name mangler`)
    assert(Number.isFinite(station.location?.latitude), `${prefix}.location.latitude mangler`)
    assert(Number.isFinite(station.location?.longitude), `${prefix}.location.longitude mangler`)
    assert(station.location.latitude >= -90 && station.location.latitude <= 90, `${prefix}.latitude er utenfor gyldig område`)
    assert(station.location.longitude >= -180 && station.location.longitude <= 180, `${prefix}.longitude er utenfor gyldig område`)
    assert(Array.isArray(station.connectors), `${prefix}.connectors må være en liste`)
    assert(Array.isArray(station.prices), `${prefix}.prices må være en liste`)

    for (const [priceIndex, price] of station.prices.entries()) {
      const pricePrefix = `${prefix}.prices[${priceIndex}]`
      assert(typeof price.provider === 'string' && price.provider.length > 0, `${pricePrefix}.provider mangler`)
      assert(ALLOWED_CUSTOMER_TYPES.has(price.customerType), `${pricePrefix}.customerType er ukjent`)
      assert(typeof price.currency === 'string' && price.currency.length === 3, `${pricePrefix}.currency mangler`)
      assert(typeof price.unit === 'string' && price.unit.length > 0, `${pricePrefix}.unit mangler`)
      assert(Array.isArray(price.periods), `${pricePrefix}.periods må være en liste`)
      for (const period of price.periods) {
        assert(Array.isArray(period.rates) && period.rates.every(Number.isFinite), `${pricePrefix}.periods har ugyldige satser`)
      }
    }
  }

  return dataset
}
