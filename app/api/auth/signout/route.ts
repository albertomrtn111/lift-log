import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const supabase = await createClient()

    // Check if we have a session
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        await supabase.auth.signOut()
    }

    const url = new URL(req.url)
    const loginUrl = new URL('/login', url.origin)

    return NextResponse.redirect(loginUrl, {
        status: 303,
    })
}
