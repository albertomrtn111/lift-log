import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'

export const dynamic = 'force-dynamic'

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
                // Sin caché del navegador: tras cambiar la foto o el nombre, la app
                // volvía a pedir el perfil y recibía el de antes durante un minuto.
                // React-query ya evita las peticiones repetidas.
                'Cache-Control': 'private, no-store',
            }
        })
    } catch (error) {
        console.error('Error in /api/me:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
