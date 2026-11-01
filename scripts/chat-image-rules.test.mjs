import assert from 'node:assert/strict'
import test from 'node:test'

import { fitWithin, isHeic, jpegFileName, shouldPrepareImage } from '../src/lib/chat-image-rules.js'

test('shouldPrepareImage recompresses phone photos and screenshots, not GIF or SVG', () => {
  assert.equal(shouldPrepareImage('image/jpeg', 'foto.jpg'), true)
  assert.equal(shouldPrepareImage('image/png', 'captura.png'), true)
  assert.equal(shouldPrepareImage('image/webp', 'a.webp'), true)
  assert.equal(shouldPrepareImage('image/gif', 'a.gif'), false)
  assert.equal(shouldPrepareImage('image/svg+xml', 'a.svg'), false)
  assert.equal(shouldPrepareImage('application/pdf', 'plan.pdf'), false)
})

test('isHeic recognises iPhone photos even when the browser gives no MIME type', () => {
  assert.equal(isHeic('image/heic', 'IMG_1.HEIC'), true)
  assert.equal(isHeic('image/heif', 'x'), true)
  assert.equal(isHeic('', 'IMG_0042.HEIC'), true)
  assert.equal(shouldPrepareImage('', 'IMG_0042.heif'), true)
  assert.equal(isHeic('image/jpeg', 'IMG_1.jpg'), false)
})

test('fitWithin keeps the aspect ratio and never upscales', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 2048, height: 1536 })
  assert.deepEqual(fitWithin(3024, 4032), { width: 1536, height: 2048 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(10000, 3, 2048), { width: 2048, height: 1 })
})

test('jpegFileName swaps the extension', () => {
  assert.equal(jpegFileName('IMG_0042.HEIC'), 'IMG_0042.jpg')
  assert.equal(jpegFileName('captura.final.png'), 'captura.final.jpg')
  assert.equal(jpegFileName('sin-extension'), 'sin-extension.jpg')
  assert.equal(jpegFileName('.png'), 'foto.jpg')
})
