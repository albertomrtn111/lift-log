import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js'

export async function middleware(req: NextRequest) {
    // REQUIRED: Handle Debug Escape Hatch first
    const { searchParams } = new URL(req.url)
    const pathname = req.nextUrl.pathname
    const isDev = process.env.NODE_ENV === 'development'

    // SECURITY: debug escape hatch only exists in development — never in production
    if (isDev && searchParams.get('debugAuth') === '1') {
        console.log(`[Middleware] Debug escape hatch active for ${pathname}`)
        return NextResponse.next()
    }

    // Inject pathname into request headers so server components can read it
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-pathname', pathname)

    let res = NextResponse.next({
        request: { headers: requestHeaders },
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }

    // Keep refreshed cookies in both the current request (for Server Components)
    // and the response (for the browser's next request).
    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
                    const updatedHeaders = new Headers(req.headers)
                    updatedHeaders.set('x-pathname', pathname)
                    res = NextResponse.next({ request: { headers: updatedHeaders } })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        res.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const redirectWithSession = (pathname: string) => {
        const url = req.nextUrl.clone()
        url.pathname = pathname
        const redirectResponse = NextResponse.redirect(url)
        res.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
        for (const header of ['cache-control', 'expires', 'pragma']) {
            const value = res.headers.get(header)
            if (value) redirectResponse.headers.set(header, value)
        }
        return redirectResponse
    }

    // 1. Validate user via getUser() (server-side verification against Supabase Auth)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user) {
        const hadSession = req.cookies.getAll().some(cookie => /^sb-.+-auth-token/.test(cookie.name))

        // Un fallo de red al validar no significa que la sesión haya caducado:
        // dejamos pasar la petición en vez de mandar al login a quien sigue dentro.
        if (hadSession && authError && isAuthRetryableFetchError(authError)) {
            console.warn(`[auth] Fallo de red validando la sesión en ${pathname}; no se cierra la sesión`)
            return res
        }

        // Rastro en producción de por qué se pierde una sesión (sin datos sensibles)
        if (hadSession && authError && !isAuthSessionMissingError(authError)) {
            const code = 'code' in authError ? authError.code : undefined
            console.warn(`[auth] Sesión perdida en ${pathname}: ${code ?? authError.name} (status ${authError.status ?? '-'})`)
        }

        // Cookies de sesión presentes pero ilegibles o vacías: es justo el caso en
        // que el atleta acaba en el login aunque su sesión siga viva en el móvil
        if (hadSession && (!authError || isAuthSessionMissingError(authError))) {
            const authCookies = req.cookies.getAll().filter(cookie => /^sb-.+-auth-token/.test(cookie.name))
            const bytes = authCookies.reduce((sum, cookie) => sum + cookie.value.length, 0)
            console.warn(`[auth] Cookies de sesión sin sesión válida en ${pathname}: ${authCookies.map(c => c.name.replace(/^sb-[^-]+-/, '')).join(', ')} (${bytes} bytes)`)
        }

        if (isDev) console.log(`[Middleware] No authenticated user at ${pathname}, redirecting to /login`)
        const loginResponse = redirectWithSession('/login')
        // Tras entrar, volver a donde iba (no para la raíz ni peticiones internas de datos)
        const isPageRequest = req.method === 'GET' && !req.headers.get('rsc') && !req.headers.get('next-router-prefetch')
        if (isPageRequest && pathname !== '/') {
            const target = new URL(loginResponse.headers.get('location') ?? '/login', req.url)
            target.search = ''
            target.searchParams.set('redirect', `${pathname}${req.nextUrl.search}`)
            loginResponse.headers.set('location', target.toString())
        }
        return loginResponse
    }

    // 2. Deterministic Role Detection via RPC
    let isCoach = false
    let isClient = false
    let resolutionSource = 'RPC'

    const { data: rolesData, error: rpcError } = await supabase.rpc('get_my_roles')

    if (rpcError) {
        if (isDev) console.error("[Middleware] RPC Role Error, trying fallback:", rpcError)
        resolutionSource = 'FALLBACK'
    }

    // Robust parsing: handle Array or Single Object
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
        console.log(`Parsed rolesRow:`, rolesRow)
        if (rpcError) console.log(`RPC Error:`, rpcError.message)
        console.log(`Resolved: { isClient: ${isClient}, isCoach: ${isCoach} } -> Mode: ${resolvedMode}`)
        console.log("------------------------------------------")
    }

    // 3. Redirection & Protection Logic
    const isNoAccessPage = pathname === '/no-access'
    const isProfilePage = pathname === '/profile'
    const isModeSelectionPage = pathname === '/mode'
    const isLoginPage = pathname === '/login'
    const isWelcomePage = pathname === '/welcome'

    // CASE: NONE (No active roles)
    if (resolvedMode === 'none') {
        // Coach recién registrado (eligió plan en /signup): su espacio se crea en /welcome
        const signupTier = user.user_metadata?.subscription_tier
        const isCoachSignup = Boolean(user.email_confirmed_at) && typeof signupTier === 'string' && signupTier.length > 0
        if (isWelcomePage) {
            return isCoachSignup ? res : redirectWithSession('/no-access')
        }
        if (isCoachSignup && !isProfilePage && !isLoginPage) {
            if (isDev) console.log(`[Middleware] Coach signup without workspace for ${user.id}, redirecting to /welcome`)
            return redirectWithSession('/welcome')
        }
        if (!isNoAccessPage && !isProfilePage && !isLoginPage) {
            if (isDev) console.log(`[Middleware] No active roles for ${user.id}, redirecting to /no-access`)
            return redirectWithSession('/no-access')
        }
        return res
    }

    // CASE: ANTI-LOOP for /no-access (If we reached here, the user HAS roles, so they shouldn't be in /no-access)
    if (isNoAccessPage) {
        if (isDev) console.log(`[Middleware] User has roles (${resolvedMode}) but is on /no-access, redirecting to home`)
        return redirectWithSession('/')
    }

    // Role-specific route markers
    const isCoachRoute = pathname.startsWith('/coach')
    const clientRoutes = ['/routine', '/diet', '/running', '/progress', '/summary', '/chat']
    const isClientRoute = clientRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))

    // CASE: COACH ACCESS PROTECTION
    if (isCoachRoute && !isCoach) {
        if (isDev) console.log(`[Middleware] Denied coach access (resolved: ${resolvedMode}), redirecting to routine`)
        return redirectWithSession('/routine')
    }

    // CASE: CLIENT ACCESS PROTECTION
    if (isClientRoute && !isClient) {
        if (isDev) console.log(`[Middleware] Denied client access (resolved: ${resolvedMode}), redirecting to coach dashboard`)
        return redirectWithSession('/coach/dashboard')
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
         * - sw.js y manifest.json (el navegador los pide sin sesión: el manifest
         *   nunca lleva cookies y el service worker no admite redirecciones)
         * - api (API routes except auth signout if needed)
         * - login
         * - signup
         * - forgot-password
         * - mode
         * - no-access
         * - assets / public files (svg, png, jpg, etc)
         */
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sw\\.js$|manifest\\.json$|api|auth|oauth|login|signup|forgot-password|set-password|mode|no-access|forms|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
}
