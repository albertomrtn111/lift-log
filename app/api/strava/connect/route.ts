import { NextResponse } from 'next/server'
import {
    buildStravaAuthorizeUrl,
    createOAuthState,
    getAuthenticatedClientContext,
} from '@/lib/strava/client'
import { getAppUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

export async function GET() {
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
        return response
    } catch (error) {
        console.error('[strava/connect]', error)
        return NextResponse.json({ error: 'No se pudo iniciar la conexión' }, { status: 500 })
    }
}
