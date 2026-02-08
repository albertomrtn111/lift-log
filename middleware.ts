import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
    // REQUIRED: Handle Debug Escape Hatch first
    const { searchParams } = new URL(req.url)
    const pathname = req.nextUrl.pathname
    const isDev = process.env.NODE_ENV === 'development'

    if (searchParams.get('debugAuth') === '1') {
        if (isDev) console.log(`[Middleware] Debug escape hatch active for ${pathname}`)
        return NextResponse.next()
    }

    let res = NextResponse.next({
        request: req,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
                    res = NextResponse.next({
                        request: req,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        res.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 1. Get User Session
    const { data: { user } } = await supabase.auth.getUser()

    // 2. Unauthenticated Redirect
    if (!user) {
        if (isDev) console.log(`[Middleware] No user found at ${pathname}, redirecting to /login`)
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 3. Deterministic Role Detection via RPC (Security Definer) with Fallback
    let isCoach = false
    let isClient = false
    let resolutionSource = 'RPC'

    const { data: rolesData, error: rpcError } = await supabase.rpc('get_my_roles')

    if (rpcError) {
        if (isDev) console.error("[Middleware] RPC Role Error, trying fallback:", rpcError)
        resolutionSource = 'FALLBACK'
    }

    // Robust parsing (Handle Array or Single Object)
    const rolesRow = Array.isArray(rolesData) ? rolesData[0] : rolesData

    if (rolesRow) {
        isCoach = !!rolesRow.is_coach
        isClient = !!rolesRow.is_client
    } else if (!rpcError) {
        if (isDev) console.warn("[Middleware] RPC returned empty, trying fallback")
        resolutionSource = 'FALLBACK'
    }

    // FALLBACK: Direct database queries if RPC failed or returned nothing
    if (resolutionSource === 'FALLBACK') {
        const [clientResult, coachResult] = await Promise.all([
            supabase.from('clients').select('id').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
            supabase.from('coach_memberships').select('id').eq('user_id', user.id).eq('status', 'active').in('role', ['owner', 'coach']).maybeSingle()
        ])
        isClient = !!clientResult.data
        isCoach = !!coachResult.data
    }

    // Calculate resolved mode
    let resolvedMode: 'client' | 'coach' | 'both' | 'none' = 'none'
    if (isCoach && isClient) resolvedMode = 'both'
    else if (isCoach) resolvedMode = 'coach'
    else if (isClient) resolvedMode = 'client'

    // OBLIGATORY DEV LOGS
    if (isDev) {
        console.log("--- [Middleware] ROLE_RESOLUTION_DEBUG ---")
        console.log(`Path: ${pathname}`)
        console.log(`User ID: ${user.id}`)
        console.log(`Source: ${resolutionSource}`)
        console.log(`Raw RPC Data:`, rolesData)
        if (rpcError) console.log(`RPC Error:`, rpcError.message)
        console.log(`Resolved: { isClient: ${isClient}, isCoach: ${isCoach} } -> Mode: ${resolvedMode}`)
        console.log("------------------------------------------")
    }

    // 4. Redirection & Protection Logic
    const isNoAccessPage = pathname === '/no-access'
    const isProfilePage = pathname === '/profile'
    const isModeSelectionPage = pathname === '/mode'
    const isLoginPage = pathname === '/login'

    // CASE: NONE (No active roles)
    if (resolvedMode === 'none') {
        if (!isNoAccessPage && !isProfilePage && !isLoginPage) {
            if (isDev) console.log(`[Middleware] No active roles for ${user.id}, redirecting to /no-access`)
            const url = req.nextUrl.clone()
            url.pathname = '/no-access'
            return NextResponse.redirect(url)
        }
        return res
    }

    // CASE: ANTI-LOOP for /no-access (If we reached here, the user HAS roles, so they shouldn't be in /no-access)
    if (isNoAccessPage) {
        if (isDev) console.log(`[Middleware] User has roles (${resolvedMode}) but is on /no-access, redirecting to home`)
        const url = req.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    // CASE: HOME (/) REDIRECTION FOR BOTH ROLES
    if (pathname === '/' && resolvedMode === 'both') {
        if (isDev) console.log(`[Middleware] Dual role user on /, redirecting to default (routine)`)
        const url = req.nextUrl.clone()
        url.pathname = '/routine'
        return NextResponse.redirect(url)
    }

    // Role-specific route markers
    const isCoachRoute = pathname.startsWith('/coach')
    const clientRoutes = ['/routine', '/diet', '/running', '/progress', '/summary']
    const isClientRoute = clientRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))

    // CASE: COACH ACCESS PROTECTION
    if (isCoachRoute && !isCoach) {
        if (isDev) console.log(`[Middleware] Denied coach access (resolved: ${resolvedMode}), redirecting to routine`)
        const url = req.nextUrl.clone()
        url.pathname = '/routine'
        return NextResponse.redirect(url)
    }

    // CASE: CLIENT ACCESS PROTECTION
    if (isClientRoute && !isClient) {
        if (isDev) console.log(`[Middleware] Denied client access (resolved: ${resolvedMode}), redirecting to coach dashboard`)
        const url = req.nextUrl.clone()
        url.pathname = '/coach/dashboard'
        return NextResponse.redirect(url)
    }

    // FINAL DECISION LOG
    if (isDev) {
        console.log(`[Middleware] Final Decision for ${pathname}: ALLOWED (Mode: ${resolvedMode})`)
    }

    return res
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - robots.txt
         * - api (API routes except auth signout if needed)
         * - login
         * - signup
         * - mode
         * - no-access
         * - assets / public files (svg, png, etc)
         */
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|api|login|signup|mode|no-access|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
}
