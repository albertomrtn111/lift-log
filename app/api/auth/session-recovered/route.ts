import { NextRequest, NextResponse } from 'next/server'
import { safeRedirectPath } from '@/lib/auth/auth-errors'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico: el login avisa cuando encuentra una sesión válida, es decir,
 * cuando el servidor mandó al login a alguien que seguía dentro. Se registra
 * qué cookies de sesión llegan al servidor (solo nombres y tamaño, nunca valores).
 */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}))
    const from = safeRedirectPath(typeof body?.from === 'string' ? body.from : null, '-').slice(0, 120)
    const authCookies = request.cookies.getAll().filter(cookie => /^sb-.+-auth-token/.test(cookie.name))
    const bytes = authCookies.reduce((sum, cookie) => sum + cookie.value.length, 0)
    const names = authCookies.map(cookie => cookie.name.replace(/^sb-[^-]+-/, '')).join(', ') || 'ninguna'
    const standalone = body?.standalone === true ? 'app instalada' : 'navegador'
    console.warn(`[auth] Login con sesión ya válida (${standalone}); venía de ${from}; cookies que ve el servidor: ${names} (${bytes} bytes)`)
    return new NextResponse(null, { status: 204 })
}
