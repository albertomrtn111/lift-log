import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DAMAGED_RECORDING_MESSAGE,
  isAudioFile,
  pickVoiceMimeType,
  sniffAudioContainer,
  voiceNoteExtension,
  voiceNoteFileName,
  voiceRecordingProblem,
} from '../src/lib/voice-note-rules.js'

const supports = (...types) => (type) => types.includes(type)
const hex = (text) => Uint8Array.from(Buffer.from(text, 'hex'))

// Cabecera real de una nota de voz de Chrome (WebM/Opus)
const CHROME_WEBM = hex('1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810442858102')

test('pickVoiceMimeType prefers AAC in MP4, which every phone plays', () => {
  // Chrome de escritorio y Safari
  assert.equal(pickVoiceMimeType(supports('audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4')), 'audio/mp4;codecs=mp4a.40.2')
  // Firefox o un Chrome sin codificador AAC
  assert.equal(pickVoiceMimeType(supports('audio/webm;codecs=opus', 'audio/webm', 'audio/ogg')), 'audio/webm;codecs=opus')
  // «audio/mp4» a secas puede ser Opus: solo si no hay WebM
  assert.equal(pickVoiceMimeType(supports('audio/mp4', 'audio/webm')), 'audio/webm')
  assert.equal(pickVoiceMimeType(supports('audio/mp4')), 'audio/mp4')
  assert.equal(pickVoiceMimeType(supports()), '')
})

test('pickVoiceMimeType survives browsers that throw on unknown types', () => {
  const picky = (type) => {
    if (type.includes('mp4')) throw new Error('no')
    return type === 'audio/webm'
  }
  assert.equal(pickVoiceMimeType(picky), 'audio/webm')
})

test('voice note extension and file name follow the recorded type', () => {
  assert.equal(voiceNoteExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a')
  assert.equal(voiceNoteExtension('audio/mp4'), 'm4a')
  assert.equal(voiceNoteExtension('audio/webm;codecs=opus'), 'webm')
  assert.equal(voiceNoteExtension('audio/ogg;codecs=opus'), 'ogg')
  assert.equal(voiceNoteExtension(''), 'webm')
  assert.equal(voiceNoteFileName('audio/mp4', new Date('2026-11-02T21:35:07Z')), 'nota-de-voz-2026-11-02-21-35-07.m4a')
})

test('isAudioFile uses the type, or the extension when the browser gives none', () => {
  assert.equal(isAudioFile('audio/webm;codecs=opus', 'nota.webm'), true)
  assert.equal(isAudioFile('audio/mpeg', 'cancion.mp3'), true)
  assert.equal(isAudioFile('', 'WhatsApp Audio.opus'), true)
  assert.equal(isAudioFile('application/octet-stream', 'nota.m4a'), true)
  assert.equal(isAudioFile('video/mp4', 'clip.mp4'), false)
  assert.equal(isAudioFile('application/pdf', 'plan.pdf'), false)
  assert.equal(isAudioFile('', 'plan.pdf'), false)
})

test('sniffAudioContainer recognises the usual audio containers', () => {
  assert.equal(sniffAudioContainer(CHROME_WEBM), 'webm')
  assert.equal(sniffAudioContainer(hex('0000001c667479704d344120')), 'mp4') // ....ftypM4A
  assert.equal(sniffAudioContainer(Uint8Array.from(Buffer.from('OggS\0\x02'))), 'ogg')
  assert.equal(sniffAudioContainer(Uint8Array.from(Buffer.from('ID3\x04\0'))), 'mp3')
  assert.equal(sniffAudioContainer(hex('fffb9064')), 'mp3')
  assert.equal(sniffAudioContainer(Uint8Array.from(Buffer.from('RIFF\x24\0\0\0WAVEfmt '))), 'wav')
  assert.equal(sniffAudioContainer(new Uint8Array(0)), null)
})

test('a Chrome voice note that lost its first byte is reported as damaged', () => {
  // Así quedó la nota del 2026-11-02: empezaba por 45 df a3 en vez de 1a 45 df a3
  const damaged = CHROME_WEBM.subarray(1)
  assert.equal(sniffAudioContainer(damaged), null)
  assert.equal(voiceRecordingProblem(damaged), DAMAGED_RECORDING_MESSAGE)
  assert.equal(voiceRecordingProblem(CHROME_WEBM), null)
})
