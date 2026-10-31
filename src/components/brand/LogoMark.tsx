import { cn } from '@/lib/utils'

/**
 * Símbolo de NexTrain en vectorial (el mismo que la web comercial y que
 * `public/logo-mark.svg`). La figura toma el color del texto (`currentColor`)
 * y la flecha va en azul de marca: #2C6CF5 en claro y #6EA0FF en oscuro.
 * `arrowClassName` sustituye el color de la flecha en superficies de color fijo.
 */
export function LogoMark({ className, arrowClassName, title }: {
    className?: string
    arrowClassName?: string
    /** Texto accesible; sin él, el símbolo es decorativo */
    title?: string
}) {
    return (
        <svg
            viewBox="-2 0 106 100"
            className={cn('h-8 w-auto shrink-0', className)}
            fill="currentColor"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
        >
            <circle cx="51.5" cy="15.5" r="7.5" stroke="none" />
            <path d="M2 52L19 35Q24 30 31 30H56.5L14.5 72H3.5L39.5 36H29Q27 36 25.5 37.5L11 52Z" />
            <path d="M57 60H72Q79 60 74 65L42.5 94H31.5L59.5 66H51Z" />
            <path
                className={arrowClassName ?? 'fill-[#2C6CF5] stroke-[#2C6CF5] dark:fill-[#6EA0FF] dark:stroke-[#6EA0FF]'}
                d="M4.5 96L77.25 23.25L68 14L101 5L92 38L82.75 28.75L15.5 96Z"
            />
        </svg>
    )
}

/** Icono de app: el símbolo en blanco sobre el cuadrado oscuro del favicon y los iconos PWA. */
export function LogoAppIcon({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center justify-center rounded-[22%] bg-[#0B0D12]', className)} aria-hidden>
            <LogoMark className="h-[70%] text-white" arrowClassName="fill-[#4F86F7] stroke-[#4F86F7]" />
        </span>
    )
}
