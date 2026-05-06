import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
    exchangeCodeForTokens,
    saveStravaIntegration,
    verifyOAuthState,
} from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

function redirectToProfile(request: NextRequest, status: 'connected' | 'error') {
    const url = new URL('/profile', request.url)
    url.searchParams.set('strava', status)
    return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
    const responseWithClearedCookie = (response: NextResponse) => {
        response.cookies.set('strava_oauth_nonce', '', { path: '/', maxAge: 0 })
        return response
    }

    try {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const scope = url.searchParams.get('scope')
        const error = url.searchParams.get('error')

        if (error || !code) {
            return responseWithClearedCookie(redirectToProfile(request, 'error'))
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return responseWithClearedCookie(NextResponse.redirect(new URL('/login', request.url)))
        }

        const stateData = verifyOAuthState(
            state,
            request.cookies.get('strava_oauth_nonce')?.value,
            user.id
        )
        const tokenResponse = await exchangeCodeForTokens(code)
        await saveStravaIntegration({
            context: {
                userId: user.id,
                clientId: stateData.clientId,
                coachId: stateData.coachId,
            },
            tokenResponse,
            scope,
        })

        return responseWithClearedCookie(redirectToProfile(request, 'connected'))
    } catch (error) {
        console.error('[strava/callback]', error)
        return responseWithClearedCookie(redirectToProfile(request, 'error'))
    }
}
