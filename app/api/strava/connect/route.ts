import { NextResponse } from 'next/server'
import {
    buildStravaAuthorizeUrl,
    createOAuthState,
    getAuthenticatedClientContext,
} from '@/lib/strava/client'
import { getAppUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

/** Cookie con la pantalla a la que volver tras conectar (solo valores conocidos) */
const STRAVA_RETURN_COOKIE = 'strava_return'

export async function GET(request: Request) {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) {
            return NextResponse.redirect(new URL('/login', getAppUrl()))
        }

        const { state, nonce, cookieName, maxAge } = createOAuthState(context)
        const response = NextResponse.redirect(buildStravaAuthorizeUrl(state))
        response.cookies.set(cookieName, nonce, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge,
        })
        // Desde la bienvenida del atleta, al terminar se vuelve allí
        if (new URL(request.url).searchParams.get('return') === 'bienvenida') {
            response.cookies.set(STRAVA_RETURN_COOKIE, 'bienvenida', {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge,
            })
        }
        return response
    } catch (error) {
        console.error('[strava/connect]', error)
        return NextResponse.json({ error: 'No se pudo iniciar la conexión' }, { status: 500 })
    }
}
