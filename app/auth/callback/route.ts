import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth Callback Route
 *
 * Handles Supabase auth redirects (invite links, magic links, password reset).
 * The flow:
 * 1. Supabase redirects here with ?code=... (PKCE) or hash fragment
 * 2. We exchange the code for a session
 * 3. Redirect to `next` query param (defaults to /)
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('[auth/callback] Code exchange error:', error.message)
            // Redirect to login with error message
            return NextResponse.redirect(`${origin}/login?error=invite_expired`)
        }

        console.log(`[auth/callback] Session established, redirecting to ${next}`)
        return NextResponse.redirect(`${origin}${next}`)
    }

    // No code — redirect to login
    console.warn('[auth/callback] No code provided')
    return NextResponse.redirect(`${origin}/login`)
}
