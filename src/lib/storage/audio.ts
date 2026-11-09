import 'server-only'

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Audios del chat a M4A (AAC), que se oye en cualquier móvil: iPhone con cualquier
 * iOS, Android y escritorio. Las notas de voz de Chrome llegan en WebM/Opus, que
 * los iPhone anteriores a iOS 17.4 no reproducen, y sin duración ni índice, así que
 * no se pueden adelantar. Con `+faststart` el índice va al principio y Safari
 * empieza a reproducir con la primera petición por rangos.
 *
 * Si ffmpeg no puede leer el archivo, el audio está dañado y no se guarda: es mejor
 * que quien lo envía lo sepa al momento que no que el atleta no lo pueda escuchar.
 * Necesita `ffmpeg` y `ffprobe` en el PATH (el Dockerfile los instala). Si faltan,
 * el audio se guarda tal cual, como antes.
 */

export type AudioConversion =
    | { ok: true; body: Uint8Array; duration: number | null }
    | { ok: false; reason: 'unreadable' | 'unavailable' }

const TIMEOUT_MS = 60_000

function run(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string; missing: boolean }> {
    return new Promise((resolve) => {
        let stdout = ''
        let stderr = ''
        let settled = false
        const done = (result: { code: number | null; missing: boolean }) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({ ...result, stdout, stderr })
        }
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        const timer = setTimeout(() => {
            child.kill('SIGKILL')
            stderr += '\n[tiempo agotado]'
        }, TIMEOUT_MS)
        child.stdout.on('data', (chunk) => { if (stdout.length < 4096) stdout += chunk })
        child.stderr.on('data', (chunk) => { if (stderr.length < 4096) stderr += chunk })
        child.on('error', (error: NodeJS.ErrnoException) => done({ code: null, missing: error.code === 'ENOENT' }))
        child.on('close', (code) => done({ code, missing: false }))
    })
}

export async function audioToM4a(input: Uint8Array): Promise<AudioConversion> {
    const dir = await mkdtemp(join(tmpdir(), 'nextrain-audio-'))
    const source = join(dir, 'entrada')
    const target = join(dir, 'salida.m4a')
    try {
        await writeFile(source, input)
        const ffmpeg = await run('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-i', source,
            '-map', '0:a:0', '-vn', '-map_metadata', '-1',
            '-c:a', 'aac', '-b:a', '96k',
            '-movflags', '+faststart',
            target,
        ])
        if (ffmpeg.missing) {
            console.warn('[audio] ffmpeg no está instalado: el audio se guarda sin convertir')
            return { ok: false, reason: 'unavailable' }
        }
        if (ffmpeg.code !== 0) {
            console.warn('[audio] ffmpeg no pudo leer el audio:', ffmpeg.stderr.trim().slice(0, 300))
            return { ok: false, reason: 'unreadable' }
        }

        const body = new Uint8Array(await readFile(target))
        if (body.byteLength === 0) return { ok: false, reason: 'unreadable' }

        const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', target])
        const seconds = Number.parseFloat(probe.stdout.trim())
        const duration = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : null
        // Un archivo que «se convierte» en un instante de silencio tampoco se puede escuchar
        if (duration !== null && duration < 0.3) return { ok: false, reason: 'unreadable' }

        return { ok: true, body, duration }
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
}
