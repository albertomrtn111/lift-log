import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const context = await getUserContext(user.id)

        return NextResponse.json(context, {
            headers: {
                'Cache-Control': 'private, max-age=60', // Cache for 1 minute
            }
        })
    } catch (error) {
        console.error('Error in /api/me:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
