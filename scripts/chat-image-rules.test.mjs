import assert from 'node:assert/strict'
import test from 'node:test'

import { fitWithin, isHeic, isRawPhoto, isWebDisplayable, jpegFileName, photoUploadProblem, shouldPrepareImage } from '../src/lib/chat-image-rules.js'

test('shouldPrepareImage recompresses phone photos and screenshots, not GIF or SVG', () => {
  assert.equal(shouldPrepareImage('image/jpeg', 'foto.jpg'), true)
  assert.equal(shouldPrepareImage('image/png', 'captura.png'), true)
  assert.equal(shouldPrepareImage('image/webp', 'a.webp'), true)
  assert.equal(shouldPrepareImage('image/gif', 'a.gif'), false)
  assert.equal(shouldPrepareImage('image/svg+xml', 'a.svg'), false)
  assert.equal(shouldPrepareImage('application/pdf', 'plan.pdf'), false)
})

test('shouldPrepareImage also tries iPhone ProRAW (DNG), TIFF and photos without a type', () => {
  assert.equal(shouldPrepareImage('image/x-adobe-dng', 'IMG_0042.DNG'), true)
  assert.equal(shouldPrepareImage('image/dng', 'IMG_0042.dng'), true)
  assert.equal(shouldPrepareImage('', 'IMG_0042.DNG'), true)
  assert.equal(shouldPrepareImage('image/tiff', 'scan.tif'), true)
  assert.equal(shouldPrepareImage('image/bmp', 'a.bmp'), true)
  assert.equal(shouldPrepareImage('', 'foto.JPG'), true)
  assert.equal(shouldPrepareImage('', 'notas.txt'), false)
})

test('isRawPhoto and isWebDisplayable', () => {
  assert.equal(isRawPhoto('image/x-adobe-dng', 'a.dng'), true)
  assert.equal(isRawPhoto('', 'IMG_1.DNG'), true)
  assert.equal(isRawPhoto('image/x-canon-cr2', 'a.cr2'), true)
  assert.equal(isRawPhoto('image/jpeg', 'IMG_1.jpg'), false)
  assert.equal(isWebDisplayable('image/jpeg'), true)
  assert.equal(isWebDisplayable('image/webp'), true)
  assert.equal(isWebDisplayable('image/gif'), true)
  assert.equal(isWebDisplayable('image/heic'), false)
  assert.equal(isWebDisplayable('image/x-adobe-dng'), false)
  assert.equal(isWebDisplayable(''), false)
})

test('isHeic recognises iPhone photos even when the browser gives no MIME type', () => {
  assert.equal(isHeic('image/heic', 'IMG_1.HEIC'), true)
  assert.equal(isHeic('image/heif', 'x'), true)
  assert.equal(isHeic('', 'IMG_0042.HEIC'), true)
  assert.equal(shouldPrepareImage('', 'IMG_0042.heif'), true)
  assert.equal(isHeic('image/jpeg', 'IMG_1.jpg'), false)
})

test('fitWithin keeps the aspect ratio and never upscales', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 })
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(10000, 3, 2048), { width: 2048, height: 1 })
})

test('jpegFileName swaps the extension', () => {
  assert.equal(jpegFileName('IMG_0042.HEIC'), 'IMG_0042.jpg')
  assert.equal(jpegFileName('captura.final.png'), 'captura.final.jpg')
  assert.equal(jpegFileName('sin-extension'), 'sin-extension.jpg')
  assert.equal(jpegFileName('.png'), 'foto.jpg')
})

test('photoUploadProblem explains why a photo cannot be uploaded', () => {
  assert.equal(photoUploadProblem('image/jpeg', 'IMG_1.jpg', 400_000), null)
  assert.equal(photoUploadProblem('image/webp', 'a.webp', 90_000), null)
  assert.match(photoUploadProblem('image/x-adobe-dng', 'IMG_1.DNG', 40_000_000), /ProRAW/)
  assert.match(photoUploadProblem('', 'IMG_1.dng', 1000), /RAW/)
  assert.match(photoUploadProblem('image/heic', 'IMG_1.HEIC', 3_000_000), /HEIC/)
  assert.match(photoUploadProblem('image/tiff', 'scan.tif', 3_000_000), /JPG o PNG/)
  assert.match(photoUploadProblem('image/jpeg', 'big.jpg', 30 * 1024 * 1024), /30 MB y el máximo es 25 MB/)
})
