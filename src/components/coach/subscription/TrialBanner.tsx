import Link from 'next/link'
import { Gift } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Aviso fino sobre el panel mientras dura la prueba gratis sin plan elegido */
export function TrialBanner({ daysLeft }: { daysLeft: number }) {
    const urgent = daysLeft <= 5
    return (
        <div className={cn('flex items-center justify-center gap-2 px-4 py-2 text-center text-[13px]', urgent ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200' : 'bg-primary/10 text-foreground')}>
            <Gift className="h-4 w-4 shrink-0" />
            <span>
                Prueba gratis de Pro: {daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`}.{' '}
                <Link href="/coach/subscription" className="font-semibold underline underline-offset-4">Elegir plan</Link>
            </span>
        </div>
    )
}
