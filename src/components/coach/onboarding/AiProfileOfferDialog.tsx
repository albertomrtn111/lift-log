'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

/** Se ofrece una sola vez, tras aprobar la primera revisión de un atleta real */
export function AiProfileOfferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:w-full">
                <DialogHeader>
                    <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="h-5 w-5" />
                    </span>
                    <DialogTitle>¿Quieres que los análisis suenen como tú? 5 minutos.</DialogTitle>
                    <DialogDescription>
                        Cuéntale a la IA cómo trabajas: cómo programas, qué miras en una revisión y cómo hablas a tus atletas.
                        A partir de ahí, sus análisis y propuestas seguirán tu método.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Ahora no
                    </Button>
                    <Button asChild>
                        <Link href="/coach/ai-onboarding">
                            Enseñar mi método
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
