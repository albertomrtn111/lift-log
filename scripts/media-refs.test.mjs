import assert from 'node:assert/strict'
import test from 'node:test'

import {
  avatarKeyFromPublicUrl,
  chatAttachmentR2Key,
  chatKey,
  checkinKey,
  checkinPathR2Key,
  isChatAttachmentOf,
  parsePrivateKey,
  privateMediaUrl,
  sanitizeFileName,
  withExtension,
} from '../src/lib/storage/media-refs.js'

const COACH = '2edbe7a8-c0a0-49c5-ab56-cc9ddd704b87'
const CLIENT = '63728f00-4b9f-4f44-86c4-f72cef6cbb31'
const CHECKIN = '2aeb16ca-a2a4-47be-8166-d4af5c842d54'

test('parsePrivateKey accepts the keys the app creates', () => {
  const checkin = checkinKey({ coachId: COACH, clientId: CLIENT, checkinId: CHECKIN, fileName: '1730000000000_ab12cd34.webp' })
  assert.deepEqual(parsePrivateKey(checkin), {
    area: 'checkin-media', coachId: COACH, clientId: CLIENT, checkinId: CHECKIN, fileName: '1730000000000_ab12cd34.webp',
  })
  const chat = chatKey({ coachId: COACH, clientId: CLIENT, fileName: `${CHECKIN}-IMG_0436.webp` })
  assert.equal(parsePrivateKey(chat)?.area, 'chat-media')
})

test('parsePrivateKey rejects invented or dangerous paths', () => {
  assert.equal(parsePrivateKey(`checkin-media/${COACH}/${CLIENT}/../x.webp`), null)
  assert.equal(parsePrivateKey(`checkin-media/${COACH}/${CLIENT}/${CHECKIN}/..`), null)
  assert.equal(parsePrivateKey(`checkin-media/${COACH}/${CLIENT}/${CHECKIN}/.hidden`), null)
  assert.equal(parsePrivateKey(`chat-media/${COACH}/not-a-uuid/a.webp`), null)
  assert.equal(parsePrivateKey(`avatars/${COACH}/a.webp`), null)
  assert.equal(parsePrivateKey(`chat-media/${COACH}/${CLIENT}/a/b.webp`), null)
  assert.equal(parsePrivateKey(`checkin-media/${COACH}/${CLIENT}/${CHECKIN}/a b.webp`), null)
})

test('stored references tell R2 and Supabase apart', () => {
  assert.equal(chatAttachmentR2Key(`r2:chat-media/${COACH}/${CLIENT}/a.webp`), `chat-media/${COACH}/${CLIENT}/a.webp`)
  assert.equal(chatAttachmentR2Key(`${COACH}/${CLIENT}/a.png`), null)
  assert.equal(checkinPathR2Key(`checkin-media/${COACH}/${CLIENT}/${CHECKIN}/a.webp`), `checkin-media/${COACH}/${CLIENT}/${CHECKIN}/a.webp`)
  assert.equal(checkinPathR2Key(`${COACH}/${CLIENT}/${CHECKIN}/a.jpg`), null)
})

test('isChatAttachmentOf only accepts files from that conversation', () => {
  const other = '00000000-0000-4000-8000-000000000000'
  assert.equal(isChatAttachmentOf(`r2:chat-media/${COACH}/${CLIENT}/a.webp`, COACH, CLIENT), true)
  assert.equal(isChatAttachmentOf(`r2:chat-media/${COACH}/${other}/a.webp`, COACH, CLIENT), false)
  assert.equal(isChatAttachmentOf(`r2:checkin-media/${COACH}/${CLIENT}/${CHECKIN}/a.webp`, COACH, CLIENT), false)
  assert.equal(isChatAttachmentOf(`${COACH}/${CLIENT}/a.png`, COACH, CLIENT), true)
  assert.equal(isChatAttachmentOf(`${COACH}/${CLIENT}/../${other}/a.png`, COACH, CLIENT), false)
})

test('file names are safe for keys', () => {
  assert.equal(sanitizeFileName('Foto día 1 (frontal).HEIC'), 'Foto_dia_1__frontal_.HEIC')
  assert.equal(sanitizeFileName('../../etc'), '_.._etc')
  assert.equal(sanitizeFileName(''), 'archivo')
  assert.equal(withExtension('IMG_0042.HEIC', 'webp'), 'IMG_0042.webp')
  assert.equal(withExtension('sin-extension', 'webp'), 'sin-extension.webp')
})

test('privateMediaUrl and avatar URLs', () => {
  assert.equal(privateMediaUrl(`chat-media/${COACH}/${CLIENT}/a b.webp`), `/api/media/chat-media/${COACH}/${CLIENT}/a%20b.webp`)
  const base = 'https://media.example.com/'
  assert.equal(avatarKeyFromPublicUrl(`https://media.example.com/avatars/${COACH}/avatar-1.webp`, base), `avatars/${COACH}/avatar-1.webp`)
  assert.equal(avatarKeyFromPublicUrl('https://otro.example.com/avatars/x.webp', base), null)
  assert.equal(avatarKeyFromPublicUrl(null, base), null)
})
