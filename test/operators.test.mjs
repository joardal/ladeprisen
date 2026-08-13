import test from 'node:test'
import assert from 'node:assert/strict'
import {
  htmlToText, parseCircleK, parseElbilReference, parseEviny, parseIonity, parseIshavsveien,
  parseKople, parseLadOpp, parseMer, parseRagdeCharge, parseRecharge
} from '../scripts/providers/operators.mjs'

test('HTML ryddes til stabil tekst', () => {
  assert.equal(htmlToText('<style>x{}</style><h1>Pris&nbsp;nå</h1><script>bad()</script>'), 'Pris nå')
})

test('Circle K leser drop-in og registrert pris', () => {
  const rates = parseCircleK('<h2>Lyn og hurtiglading:</h2><p>Registrert i Circle K extra 5.99 kr / kWt</p><p>Drop-in: 6.29 kr / kWt</p><h2>Normallading</h2>')
  assert.deepEqual(rates.map(rate => rate.amount), [6.29, 5.99])
})

test('Eviny leser hurtigladepris', () => {
  assert.equal(parseEviny('<li>Hurtiglading/lynlading: NOK 5,89 kr/kWh</li>')[0].amount, 5.89)
})

test('IONITY isolerer Norge og riktig produkttype', () => {
  const html = '<p>Norway</p><p>3.12 NOK/kWh</p><p>power-kwh-price</p><p>5.00 NOK/kWh</p><p>go-kwh-price</p><p>5.27 NOK/kWh</p><p>direct-kwh-price</p><p>Poland</p>'
  assert.deepEqual(parseIonity(html).map(rate => rate.amount), [5.27, 5])
})

test('Ishavsveien leser to effektklasser', () => {
  const rates = parseIshavsveien('<h1>Hurtiglading</h1><p>50-120 kW</p><p>4,25 kr pr kWh</p><h1>Lynlading</h1><p>>150 kW</p><p>4,75 kr pr kWh</p>')
  assert.deepEqual(rates.map(rate => rate.amount), [4.25, 4.75])
})

test('Kople leser dag-, kunde- og nattpris', () => {
  const html = '<h3>Lyn- og hurtiglading</h3><p>(fra 51 kW effekt og oppover)</p><p>Drop-in: 6,49 kr/kWh.</p><p>Kople app/RFID: 6,29 kr/kWh.</p><p>Nattpris fra 00 - 06: 4,99 kr/kWh.</p><h3>Semi-hurtig lading</h3>'
  const rates = parseKople(html)
  assert.deepEqual(rates.map(rate => rate.amount), [6.49, 6.29, 4.99, 4.99])
  assert.deepEqual(rates.map(rate => rate.time), [
    { startTime: '06:00', endTime: '00:00' },
    { startTime: '06:00', endTime: '00:00' },
    { startTime: '00:00', endTime: '06:00' },
    { startTime: '00:00', endTime: '06:00' }
  ])
})

test('Lad Opp og Mer leser sine hurtigladepriser', () => {
  assert.equal(parseLadOpp('<h1>LYN &amp; HURTIG</h1><p>Kople APP, RFID og Drop-in 5,99/kWh</p>')[0].amount, 5.99)
  assert.equal(parseMer('<p>Hurtig- og lynlading (50-400 kw) 6,29 kr per kWh</p>')[0].amount, 6.29)
})

test('Recharge leser drop-in og abonnement uten å blande produktene', () => {
  const html = '<h4>Recharge MOVE</h4><p>Kr 4,79/kWt med et abonnement på 69,- per mnd.</p><h4>Recharge FLOW</h4><p>Kr 6,49/kWt</p><h4>Drop-in</h4><p>For spontane ladere.</p><p>Kr 6,49/kWt</p>'
  assert.deepEqual(parseRecharge(html).map(rate => rate.amount), [6.49, 4.79])
})

test('Ragde Charge leser regionale priser fra offisiell side', () => {
  const html = '<h3>Priser for Lynlading</h3><h4>Oslo &amp; Sør-Norge fra</h4><p>5,99 kr/kWh</p><h4>Nord &amp; Midt Norge fra</h4><p>4,99 kr/kWh</p><h3>Priser for Destinasjonslading</h3>'
  const rates = parseRagdeCharge(html)
  assert.deepEqual(rates.map(rate => [rate.amount, rate.region]), [[5.99, 'south'], [4.99, 'north-central']])
})

test('Elbilforeningens Infogram leses med kildedato', () => {
  const rows = [
    [{ value: 'Operatør' }, null],
    ...['Circle K', 'Eviny', 'E.ON Drive & Clever', 'Ionity', 'Ishavsveien', 'Kople', 'Lad Opp', 'Mer', 'Ragde Charge', 'Recharge', 'Tesla*', 'Uno-X']
      .map((name, index) => [{ value: name }, { value: String(4 + index / 10).replace('.', ',') }])
  ]
  const payload = { updatedAt: '2026-08-05T08:06:51.000Z', elements: { content: { nested: { data: [rows] } } } }
  const result = parseElbilReference(`<script>window.infographicData=${JSON.stringify(payload)};</script>`)
  assert.equal(result.prices['E.ON Drive & Clever'], 4.2)
  assert.equal(result.prices['Uno-X'], 5.1)
  assert.equal(result.sourceUpdatedAt, '2026-08-05T08:06:51.000Z')
})

test('urimelige priser og manglende felt avvises', () => {
  assert.throws(() => parseEviny('Hurtiglading/lynlading: NOK 59,89 kr/kWh'), /Uventet prisverdi/)
  assert.throws(() => parseMer('ingen pris her'), /Fant ikke/)
})
