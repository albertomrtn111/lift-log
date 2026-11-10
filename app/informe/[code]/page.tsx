import type { Metadata } from 'next'
import { ReportDocument, type ReportPayload } from '@/components/reports/ReportDocument'
import { ReportSlides } from '@/components/reports/ReportSlides'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Informe de sesión', robots: { index: false, follow: false } }

export default async function ReportPage({ params, searchParams }: {
    params: Promise<{ code: string }>
    searchParams: Promise<{ formato?: string }>
}) {
    const [{ code }, { formato }] = await Promise.all([params, searchParams])
    const supabase = await createClient()
    const { data } = /^[0-9a-f]{40,}$/.test(code)
        ? await supabase.rpc('report_by_code', { p_code: code })
        : { data: null }

    if (!data) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-white p-6 text-center text-slate-600">
                <p>Este informe ya no está disponible.</p>
            </main>
        )
    }
    return formato === 'presentacion'
        ? <ReportSlides report={data as ReportPayload} documentHref={`/informe/${code}`} />
        : <ReportDocument report={data as ReportPayload} />
}
