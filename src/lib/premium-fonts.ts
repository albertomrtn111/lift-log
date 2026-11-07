import { Inter_Tight, JetBrains_Mono } from 'next/font/google'

// Tipografías de la web comercial para las dos apps: titulares y cifras (Inter
// Tight) y etiquetas (JetBrains Mono). Solo las cargan los layouts del coach y
// del atleta.
const display = Inter_Tight({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap' })

/** Variables en <html>, para que lleguen también a diálogos, hojas y menús. */
export const premiumFontVars =
    `html:has(:is(.coach-shell, .app-mobile-shell)){--font-display:${display.style.fontFamily};--font-mono:${mono.style.fontFamily}}`
