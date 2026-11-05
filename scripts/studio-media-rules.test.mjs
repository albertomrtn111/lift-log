import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attachmentImageVisible,
  exercisesWithMedia,
  mediaForExercise,
  parseMediaLink,
  youtubeId,
  youtubeSearchUrl,
} from '../src/lib/studio/media-rules.js'

const ID = 'dQw4w9WgXcQ'

test('youtubeId reads the usual link shapes', () => {
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}&t=10s`), ID)
  assert.equal(youtubeId(`https://m.youtube.com/watch?v=${ID}`), ID)
  assert.equal(youtubeId(`https://youtu.be/${ID}?si=abc`), ID)
  assert.equal(youtubeId(`https://www.youtube.com/shorts/${ID}`), ID)
  assert.equal(youtubeId(`https://www.youtube.com/embed/${ID}`), ID)
})

test('youtubeId rejects anything else', () => {
  assert.equal(youtubeId('https://www.youtube.com/channel/abc'), null)
  assert.equal(youtubeId('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(youtubeId('https://vimeo.com/123'), null)
  assert.equal(youtubeId('no es un enlace'), null)
})

test('parseMediaLink tells YouTube from other links', () => {
  assert.equal(parseMediaLink(` https://youtu.be/${ID} `).kind, 'youtube')
  assert.deepEqual(parseMediaLink('https://www.instagram.com/p/x/'), { url: 'https://www.instagram.com/p/x/', kind: 'link' })
})

test('parseMediaLink adds https when it is missing', () => {
  assert.equal(parseMediaLink('example.com/video').url, 'https://example.com/video')
})

test('parseMediaLink only accepts safe links', () => {
  assert.ok(parseMediaLink('').error)
  assert.ok(parseMediaLink('javascript:alert(1)').error)
  assert.ok(parseMediaLink('data:text/html,hola').error)
  assert.ok(parseMediaLink('http://example.com').error)
  assert.ok(parseMediaLink('hola').error)
  assert.ok(parseMediaLink(`https://example.com/${'a'.repeat(500)}`).error)
})

test('youtubeSearchUrl looks for the technique', () => {
  assert.equal(youtubeSearchUrl('Press banca'), 'https://www.youtube.com/results?search_query=Press%20banca%20t%C3%A9cnica')
})

test('mediaForExercise shows the client first and then the room', () => {
  const media = [
    { id: 'sala', catalog_exercise_id: 'a', client_id: null },
    { id: 'otro', catalog_exercise_id: 'b', client_id: null },
    { id: 'cliente', catalog_exercise_id: 'a', client_id: 'c' },
  ]
  assert.deepEqual(mediaForExercise(media, 'a').map(entry => entry.id), ['cliente', 'sala'])
  assert.deepEqual([...exercisesWithMedia(media)].sort(), ['a', 'b'])
})

test('a client image in a cell needs the consent', () => {
  const room = 'studio-media/coach/coach/a.webp'
  const client = 'studio-media/coach/ana/a.webp'
  assert.equal(attachmentImageVisible(room, 'coach', false), true)
  assert.equal(attachmentImageVisible(client, 'coach', false), false)
  assert.equal(attachmentImageVisible(client, 'coach', true), true)
  assert.equal(attachmentImageVisible(null, 'coach', true), false)
})
