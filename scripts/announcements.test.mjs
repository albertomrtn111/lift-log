import assert from 'node:assert/strict'
import test from 'node:test'

import {
    announcementCandidates,
    catalogProblems,
    pickAnnouncement,
    toAnnouncementView,
} from '../src/lib/announcements/announcements.js'
import { ANNOUNCEMENTS } from '../src/lib/announcements/catalog.js'

const now = new Date('2026-11-15T10:00:00Z')
const context = { hasAvatar: false, stravaConnected: false, onboarding: {}, accountCreatedAt: '2026-01-01T00:00:00Z' }

const link = (id, extra = {}) => ({
    id,
    audience: 'athlete',
    icon: 'sparkles',
    eyebrow: 'Novedad',
    title: `Título ${id}`,
    body: 'Texto',
    action: { type: 'link', label: 'Ir', href: '/profile' },
    ...extra,
})

test('the real catalog is well formed', () => {
    assert.deepEqual(catalogProblems(ANNOUNCEMENTS), [])
})

test('catalog problems catch the usual mistakes', () => {
    const problems = catalogProblems([
        link('nuevo-aviso'),
        link('nuevo-aviso'),
        link('Con Espacios'),
        link('sin-ruta', { action: { type: 'link', label: 'Ir', href: 'https://example.com' } }),
        link('fecha-mal', { startsAt: 'mañana' }),
        link('icono-raro', { icon: 'rocket' }),
    ])
    assert.deepEqual(problems, [
        'nuevo-aviso: id repetido',
        'Con Espacios: el id debe ser kebab-case',
        'sin-ruta: el enlace debe ser una ruta de la app',
        'fecha-mal: startsAt no es una fecha',
        'icono-raro: icono desconocido',
    ])
})

test('seen announcements, other audiences and out-of-date ones are not candidates', () => {
    const catalog = [
        link('visto'),
        link('para-coach', { audience: 'coach' }),
        link('futuro', { startsAt: '2026-12-01' }),
        link('caducado', { endsAt: '2026-11-10' }),
        link('vigente', { startsAt: '2026-11-01', endsAt: '2026-12-01' }),
    ]
    const candidates = announcementCandidates(catalog, { audience: 'athlete', now, seenIds: ['visto'] })
    assert.deepEqual(candidates.map(item => item.id), ['vigente'])
})

test('the first pending announcement in catalog order wins, skipping the ones that do not apply', () => {
    const catalog = [
        link('solo-con-strava', { when: (ctx) => ctx.stravaConnected }),
        link('segundo'),
        link('tercero'),
    ]
    assert.equal(pickAnnouncement(catalog, context).id, 'segundo')
    assert.equal(pickAnnouncement(catalog, { ...context, stravaConnected: true }).id, 'solo-con-strava')
    assert.equal(pickAnnouncement([], context), null)
})

test('the profile photo announcement only goes to athletes without a photo who were not asked in the welcome', () => {
    const [photo] = announcementCandidates(ANNOUNCEMENTS, { audience: 'athlete', now, seenIds: [] }).filter(item => item.id === 'profile-photo')
    assert.ok(photo)
    assert.equal(pickAnnouncement([photo], context)?.id, 'profile-photo')
    assert.equal(pickAnnouncement([photo], { ...context, hasAvatar: true }), null)
    assert.equal(pickAnnouncement([photo], { ...context, onboarding: { guided: true, photo: 'skipped' } }), null)
    assert.deepEqual(announcementCandidates(ANNOUNCEMENTS, { audience: 'athlete', now, seenIds: ['profile-photo'] }).filter(item => item.id === 'profile-photo'), [])
})

test('the browser only gets what it renders', () => {
    const view = toAnnouncementView(link('vista', { when: () => true, startsAt: '2026-11-01' }))
    assert.deepEqual(Object.keys(view).sort(), ['action', 'body', 'eyebrow', 'icon', 'id', 'title'])
})
