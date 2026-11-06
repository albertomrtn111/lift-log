import assert from 'node:assert/strict'
import test from 'node:test'

import {
  durationProblem,
  enoughFrames,
  formatDuration,
  formatSize,
  needsCompression,
  recorderType,
  sniffVideo,
  targetSize,
  titleFromFile,
} from '../src/lib/studio/video-rules.js'

test('targetSize keeps the shape at 720p and never enlarges', () => {
  assert.deepEqual(targetSize(1920, 1080), { width: 1280, height: 720 })
  assert.deepEqual(targetSize(1080, 1920), { width: 720, height: 1280 })
  assert.deepEqual(targetSize(640, 360), { width: 640, height: 360 })
  assert.deepEqual(targetSize(1081, 1921), { width: 720, height: 1280 })
})

test('needsCompression leaves light videos alone', () => {
  const light = { size: 10 * 1024 * 1024, seconds: 60, width: 1280, height: 720 }
  assert.equal(needsCompression(light), false)
  assert.equal(needsCompression({ ...light, size: 100 * 1024 * 1024 }), true)
  assert.equal(needsCompression({ ...light, width: 1920, height: 1080 }), true)
})

test('recorderType prefers mp4', () => {
  assert.equal(recorderType(() => true), 'video/mp4;codecs=avc1.42E01E')
  assert.equal(recorderType(type => type.startsWith('video/webm')), 'video/webm;codecs=vp9')
  assert.equal(recorderType(() => false), null)
})

test('durationProblem rejects unreadable and long videos', () => {
  assert.equal(durationProblem(120), null)
  assert.ok(durationProblem(301))
  assert.ok(durationProblem(Number.NaN))
  assert.ok(durationProblem(Number.POSITIVE_INFINITY))
})

test('enoughFrames catches a video that stopped', () => {
  assert.equal(enoughFrames(1, 3), false)
  assert.equal(enoughFrames(90, 3), true)
  assert.equal(enoughFrames(2, 0.1), true)
})

test('sniffVideo reads the real type', () => {
  const ftyp = (brand) => new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftyp'), ...Buffer.from(brand)])
  assert.deepEqual(sniffVideo(ftyp('isom')), { mime: 'video/mp4', ext: 'mp4' })
  assert.deepEqual(sniffVideo(ftyp('qt  ')), { mime: 'video/quicktime', ext: 'mov' })
  assert.deepEqual(sniffVideo(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), { mime: 'video/webm', ext: 'webm' })
  assert.equal(sniffVideo(new TextEncoder().encode('<html><script>alert(1)</script>')), null)
  assert.equal(sniffVideo(new Uint8Array(3)), null)
})

test('titleFromFile makes a readable name', () => {
  assert.equal(titleFromFile('Sentadilla_búlgara-2.mp4'), 'Sentadilla búlgara 2')
  assert.equal(titleFromFile('.mp4'), 'Vídeo')
  assert.equal(titleFromFile('a'.repeat(200) + '.mov').length, 120)
})

test('durations and sizes read well', () => {
  assert.equal(formatDuration(65), '1:05')
  assert.equal(formatDuration(null), '')
  assert.equal(formatSize(1.5 * 1024 * 1024), '1,5 MB')
  assert.equal(formatSize(34.4 * 1024 * 1024), '34 MB')
})
