import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Los emails con enlace o credencial de acceso salen siempre por el correo de
// NexTrain. Estas pruebas leen el código para que un envío nuevo no se salte la regla.

const root = fileURLToPath(new URL('..', import.meta.url))
const mailer = readFileSync(join(root, 'src/lib/email/mailer.ts'), 'utf8')

function functionBody(source, name) {
    const start = source.indexOf(`async function ${name}(`)
    assert.notEqual(start, -1, `no existe ${name}`)
    const open = source.indexOf('{\n', source.indexOf(')', start))
    let depth = 0
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++
        if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
    }
    throw new Error(`no se pudo leer ${name}`)
}

function sourceFiles(dir) {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : sourceFiles(path)
        return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : []
    })
}

test('las invitaciones y los emails con contraseña salen por el correo de NexTrain', () => {
    for (const name of ['sendAthleteInviteEmail', 'sendTeamInviteEmail', 'sendInviteEmailSmtp']) {
        const body = functionBody(mailer, name)
        assert.match(body, /sendAccessEmail\(/, name)
        assert.doesNotMatch(body, /sendWorkspaceEmail\(|getCoachSmtpConfig/, name)
    }
})

test('el envío de acceso no mira el SMTP del espacio', () => {
    const body = functionBody(mailer, 'sendAccessEmail')
    assert.doesNotMatch(body, /coach|sendWorkspaceEmail/i)
    assert.doesNotMatch(mailer, /async function sendAccessEmail\([^)]*coachId/)
})

test('el envío del espacio descarta lo que lleve un enlace de acceso', () => {
    const body = functionBody(mailer, 'sendWorkspaceEmail')
    assert.ok(body.indexOf('mayUseCoachSmtp') !== -1 && body.indexOf('mayUseCoachSmtp') < body.indexOf('getCoachSmtpConfig'))
})

test('los enlaces de acceso solo se generan donde se envían por el correo de NexTrain', () => {
    const allowed = new Map([
        // buildAccessLink: invitación de atleta (sendAthleteInviteEmail)
        ['src/lib/onboarding/athlete-invite.ts', /sendAthleteInviteEmail/],
        // invitación de equipo (sendTeamInviteEmail)
        ['src/lib/team/send-invitation.ts', /sendTeamInviteEmail/],
        // Página de la invitación (NXT-145): solo con el enlace firmado que
        // llegó en uno de esos dos emails
        ['app/auth/invitacion/[token]/actions.ts', /readInviteToken\(token, secret\)/],
    ])
    const offenders = []
    for (const file of [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))]) {
        const text = readFileSync(file, 'utf8')
        if (!/generateLink\(|buildAccessLink\(|buildAthleteAccessLink\(/.test(text)) continue
        const path = relative(root, file).split('\\').join('/')
        const rule = allowed.get(path)
        if (!rule || !rule.test(text)) offenders.push(path)
    }
    assert.deepEqual(offenders, [], 'Si generas un enlace de acceso nuevo, envíalo con un email de acceso (sendAccessEmail) y añádelo aquí')
})
