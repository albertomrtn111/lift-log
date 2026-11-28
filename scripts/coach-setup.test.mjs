import assert from 'node:assert/strict'
import test from 'node:test'
import {
    describeMethod,
    initialsOf,
    joinList,
    methodStepError,
    nextSetupStep,
    normalizeInstagram,
    normalizePhone,
    normalizeWebsite,
    profileCompletion,
    resumeSetupStep,
    sanitizeMethodForm,
    splitList,
    validateAboutYou,
    validateBusiness,
    visibleSetupSteps,
} from '../src/lib/onboarding/coach-setup.js'

// Primer día del coach (NXT-186)

test('el paso de nutrición solo aparece si trabaja la nutrición', () => {
    assert.deepEqual(
        visibleSetupSteps(['strength']).map(step => step.id),
        ['tu', 'negocio', 'disciplinas', 'especialidad', 'entrenamiento', 'revisiones', 'comunicacion'],
    )
    assert.ok(visibleSetupSteps(['strength', 'nutrition']).some(step => step.id === 'nutricion'))
})

test('orden de los pasos y paso siguiente', () => {
    assert.equal(nextSetupStep('tu', []), 'negocio')
    assert.equal(nextSetupStep('negocio', []), 'disciplinas')
    assert.equal(nextSetupStep('entrenamiento', ['strength']), 'revisiones')
    assert.equal(nextSetupStep('entrenamiento', ['nutrition']), 'nutricion')
    assert.equal(nextSetupStep('comunicacion', ['nutrition']), null)
})

test('retoma en el paso guardado, o en el primero si ya no existe', () => {
    assert.equal(resumeSetupStep('revisiones', ['strength']), 'revisiones')
    assert.equal(resumeSetupStep('nutricion', ['strength']), 'tu')
    assert.equal(resumeSetupStep('paso-viejo', []), 'tu')
    assert.equal(resumeSetupStep(null, []), 'tu')
})

test('teléfono, Instagram y web', () => {
    assert.deepEqual(normalizePhone(' +34  600 123 456 '), { value: '+34 600 123 456', valid: true })
    assert.equal(normalizePhone('600').valid, false)
    assert.equal(normalizePhone('abc 123 456 789').valid, false)
    assert.deepEqual(normalizeInstagram('https://instagram.com/alex.coach/?hl=es'), { value: 'alex.coach', valid: true })
    assert.deepEqual(normalizeInstagram('@alex_coach'), { value: 'alex_coach', valid: true })
    assert.equal(normalizeInstagram('alex coach').valid, false)
    assert.deepEqual(normalizeWebsite('alexcoach.com'), { value: 'https://alexcoach.com', valid: true })
    assert.equal(normalizeWebsite('no es una web').valid, false)
    assert.deepEqual(normalizeWebsite(''), { value: '', valid: true })
})

test('sobre ti: nombre, teléfono y ciudad obligatorios', () => {
    assert.equal(validateAboutYou({ fullName: '', phone: '600123456', city: 'Madrid' }).ok, false)
    const noPhone = validateAboutYou({ fullName: 'Álex Ruiz', phone: '', city: 'Madrid' })
    assert.equal(noPhone.ok, false)
    assert.equal(noPhone.ok ? null : noPhone.field, 'phone')
    assert.equal(validateAboutYou({ fullName: 'Álex Ruiz', phone: '600123456', city: '' }).ok, false)
    const ok = validateAboutYou({ fullName: '  Álex   Ruiz ', phone: '600 123 456', city: ' Madrid ' })
    assert.ok(ok.ok)
    assert.deepEqual(ok.ok && ok.data, { fullName: 'Álex Ruiz', phone: '600 123 456', city: 'Madrid' })
})

test('tu negocio: nombre obligatorio, redes opcionales', () => {
    assert.equal(validateBusiness({ businessName: ' ' }).ok, false)
    const ok = validateBusiness({ businessName: 'Álex Coaching', instagram: '@alex', website: '' })
    assert.ok(ok.ok)
    assert.deepEqual(ok.ok && ok.data, { businessName: 'Álex Coaching', instagram: 'alex', website: null })
    assert.equal(validateBusiness({ businessName: 'X', instagram: 'mal usuario' }).ok, false)
})

test('lo mínimo de cada paso del método', () => {
    assert.ok(methodStepError('especialidad', {}))
    assert.equal(methodStepError('especialidad', { specialty: ['Fuerza'] }), null)
    assert.ok(methodStepError('entrenamiento', { training_priorities: ['Adherencia'] }))
    assert.equal(methodStepError('entrenamiento', { training_priorities: ['Adherencia'], progression_style: 'Doble progresión' }), null)
    assert.ok(methodStepError('nutricion', { macro_or_options: ' ' }))
    assert.ok(methodStepError('revisiones', {}))
    assert.equal(methodStepError('comunicacion', { communication_tone: 'Directo y conciso' }), null)
})

test('solo guarda campos conocidos, recortados y sin repetir', () => {
    const out = sanitizeMethodForm({
        specialty: ['Fuerza', ' Fuerza ', 3, ''],
        training_philosophy: '  Básicos bien hechos  ',
        coach_id: 'otro',
        generated_system_prompt: 'no',
    })
    assert.deepEqual(out, { specialty: ['Fuerza'], training_philosophy: 'Básicos bien hechos' })
})

test('las listas guardadas como texto van y vuelven', () => {
    assert.equal(joinList(['Adherencia al plan', 'Sueño y recuperación', 'Adherencia al plan']), 'Adherencia al plan, Sueño y recuperación')
    assert.deepEqual(splitList('Adherencia al plan, Sueño y recuperación'), ['Adherencia al plan', 'Sueño y recuperación'])
    assert.deepEqual(splitList(''), [])
})

test('el perfil en vivo solo dice lo que ha contestado', () => {
    assert.deepEqual(describeMethod({ method: {} }), [])
    const lines = describeMethod({
        method: {
            specialty: ['Fuerza', 'Hipertrofia'],
            client_types: ['Profesionales con poco tiempo'],
            training_priorities: ['Adherencia'],
            progression_style: 'Doble progresión',
            metrics_vs_feelings: 'Equilibrio 50/50',
            checkin_priorities: 'Adherencia al plan, Sueño y recuperación',
            communication_tone: 'Cercano y motivador',
        },
    })
    assert.deepEqual(lines.map(line => line.key), ['especialidad', 'entrenamiento', 'revisiones', 'voz'])
    assert.equal(lines[0].text, 'Especialista en fuerza y hipertrofia, sobre todo con profesionales con poco tiempo.')
    assert.equal(lines[1].text, 'Al programar priorizas adherencia, y progresas con doble progresión.')
    assert.match(lines[2].text, /pesan igual.*adherencia al plan y sueño y recuperación\.$/)
    assert.equal(lines[3].text, 'Hablas con un tono cercano y motivador.')
})

test('el porcentaje del perfil crece con las respuestas', () => {
    const empty = profileCompletion({ disciplines: [], method: {} })
    const some = profileCompletion({ disciplines: ['strength'], about: { fullName: 'Álex' }, method: { specialty: ['Fuerza'] } })
    assert.equal(empty, 0)
    assert.ok(some > empty && some < 100)
    const full = profileCompletion({
        disciplines: ['strength'],
        about: { fullName: 'Álex' },
        method: {
            specialty: ['Fuerza'], client_types: ['Atletas'], athlete_level: ['Avanzados'], training_priorities: ['Adherencia'],
            progression_style: 'Doble progresión', training_philosophy: 'Básicos', metrics_vs_feelings: 'Equilibrio 50/50',
            checkin_priorities: 'Adherencia al plan', alert_types: 'Mal descanso', communication_tone: 'Directo y conciso',
            response_style: ['Sin tecnicismos'],
        },
    })
    assert.equal(full, 100)
})

test('iniciales del avatar', () => {
    assert.equal(initialsOf('Álex Coaching'), 'ÁC')
    assert.equal(initialsOf('yoli'), 'YO')
    assert.equal(initialsOf('  '), 'NT')
})
