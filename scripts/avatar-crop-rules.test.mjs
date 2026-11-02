import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AVATAR_CROP_MAX_ZOOM,
  clampCrop,
  cropRect,
  displaySize,
  initialCrop,
  outputSide,
  panCrop,
  zoomCrop,
} from '../src/lib/avatar-crop-rules.js'

// Foto vertical y horizontal del iPhone (12 MP), ya girada según el EXIF
const PORTRAIT = [3024, 4032]
const LANDSCAPE = [4032, 3024]

test('starts centred with the short side filling the circle', () => {
  assert.deepEqual(cropRect(initialCrop(), ...PORTRAIT), { sx: 0, sy: 504, size: 3024 })
  assert.deepEqual(cropRect(initialCrop(), ...LANDSCAPE), { sx: 504, sy: 0, size: 3024 })
  assert.deepEqual(displaySize(...PORTRAIT, 1), { width: 1, height: 4032 / 3024 })
})

test('the circle reaches the top and bottom edge of a portrait photo', () => {
  const top = panCrop(initialCrop(), 0, 10, ...PORTRAIT)
  assert.equal(cropRect(top, ...PORTRAIT).sy, 0)
  const bottom = panCrop(initialCrop(), 0, -10, ...PORTRAIT)
  assert.equal(cropRect(bottom, ...PORTRAIT).sy, 4032 - 3024)
  // Con zoom 1 no hay margen horizontal
  assert.equal(panCrop(initialCrop(), 5, 0, ...PORTRAIT).x, 0)
})

test('the circle reaches the left and right edge of a landscape photo', () => {
  assert.equal(cropRect(panCrop(initialCrop(), 10, 0, ...LANDSCAPE), ...LANDSCAPE).sx, 0)
  assert.equal(cropRect(panCrop(initialCrop(), -10, 0, ...LANDSCAPE), ...LANDSCAPE).sx, 4032 - 3024)
})

test('zoom stays between 1 and the maximum and the photo always covers the circle', () => {
  assert.equal(clampCrop({ zoom: 0.2, x: 0, y: 0 }, ...PORTRAIT).zoom, 1)
  assert.equal(clampCrop({ zoom: 99, x: 0, y: 0 }, ...PORTRAIT).zoom, AVATAR_CROP_MAX_ZOOM)
  assert.equal(clampCrop({ zoom: Number.NaN, x: 0, y: 0 }, ...PORTRAIT).zoom, 1)

  // Al reducir el zoom, la foto se recoloca para no dejar hueco en el círculo
  const zoomedToCorner = panCrop({ zoom: 3, x: 0, y: 0 }, 10, 10, ...PORTRAIT)
  const back = zoomCrop(zoomedToCorner, 1, { x: 0, y: 0 }, ...PORTRAIT)
  const rect = cropRect(back, ...PORTRAIT)
  assert.equal(rect.sx, 0)
  assert.equal(rect.sy, 0)
  assert.equal(rect.size, 3024)
})

test('zooming keeps the point under the fingers still', () => {
  const focus = { x: 0.25, y: -0.2 }
  const before = { zoom: 1.5, x: 0.1, y: 0.05 }
  const after = zoomCrop(before, 2.5, focus, ...LANDSCAPE)
  // Punto de la foto bajo el foco, en px de la imagen, antes y después
  const pointAt = (state) => {
    const scale = state.zoom / 3024
    return [4032 / 2 + (focus.x - state.x) / scale, 3024 / 2 + (focus.y - state.y) / scale]
  }
  const [bx, by] = pointAt(before)
  const [ax, ay] = pointAt(after)
  assert.ok(Math.abs(bx - ax) < 1e-6)
  assert.ok(Math.abs(by - ay) < 1e-6)
})

test('the crop square never leaves the photo', () => {
  for (const [w, h] of [PORTRAIT, LANDSCAPE, [500, 500], [300, 2000]]) {
    for (const zoom of [1, 1.7, AVATAR_CROP_MAX_ZOOM]) {
      for (const [dx, dy] of [[-9, -9], [9, 9], [0.3, -0.4]]) {
        const { sx, sy, size } = cropRect(panCrop({ zoom, x: 0, y: 0 }, dx, dy, w, h), w, h)
        assert.ok(sx >= 0 && sy >= 0, `${w}x${h} z${zoom}`)
        assert.ok(sx + size <= w + 1e-9 && sy + size <= h + 1e-9, `${w}x${h} z${zoom}`)
      }
    }
  }
})

test('outputSide caps the square at the avatar size', () => {
  assert.equal(outputSide(3024, 512), 512)
  assert.equal(outputSide(300.4, 512), 300)
  assert.equal(outputSide(0.2, 512), 1)
})
