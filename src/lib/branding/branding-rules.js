/** Reglas del look & feel, sin dependencias para poder probarlas con node --test. */

export const BRANDING_SLOTS = ['logo_light', 'logo_dark', 'icon']
export const NEXTRAIN_PRIMARY = '#0058D8'
export const DISPLAY_NAME_MAX = 80
export const REPORT_FOOTER_MAX = 300

/** Contraste mínimo del color principal sobre blanco: se usa también como texto. */
const MIN_CONTRAST_ON_WHITE = 3
const MIN_TEXT_CONTRAST = 4.5
/** Fondo del tema oscuro (--background en src/index.css). */
const DARK_BACKGROUND = '#090e1a'

export function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function channels(hex) {
    return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16))
}

function luminance(hex) {
    const [r, g, b] = channels(hex).map(value => {
        const part = value / 255
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(first, second) {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
    return (light + 0.05) / (dark + 0.05)
}

/** Si no se lee bien sobre blanco, la app usa el color de NexTrain. */
export function isReadablePrimary(hex) {
    return isHexColor(hex) && contrastRatio(hex, '#ffffff') >= MIN_CONTRAST_ON_WHITE
}

function hexToHsl(hex) {
    const [r, g, b] = channels(hex).map(value => value / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l: lightness * 100 }
    const delta = max - min
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    let hue
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0)
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    return { h: hue * 60, s: saturation * 100, l: lightness * 100 }
}

function hslToHex({ h, s, l }) {
    const saturation = s / 100
    const lightness = l / 100
    const amount = saturation * Math.min(lightness, 1 - lightness)
    const part = n => {
        const k = (n + h / 30) % 12
        const value = lightness - amount * Math.max(-1, Math.min(k - 3, 9 - k, 1))
        return Math.round(value * 255).toString(16).padStart(2, '0')
    }
    return `#${part(0)}${part(8)}${part(4)}`
}

function hslVar({ h, s, l }) {
    return `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`
}

/** Mismo tono, más claro, hasta que se lea sobre el fondo oscuro. */
function darkModeVariant(hsl) {
    let lightness = hsl.l
    while (lightness < 90 && contrastRatio(hslToHex({ ...hsl, l: lightness }), DARK_BACKGROUND) < MIN_TEXT_CONTRAST) {
        lightness += 2
    }
    return { ...hsl, l: lightness }
}

/** Variables CSS del tema, o null para quedarse con los colores de NexTrain. */
export function brandingCss(primaryColor) {
    if (!isReadablePrimary(primaryColor)) return null
    const hsl = hexToHsl(primaryColor)
    const light = hslVar(hsl)
    const dark = hslVar(darkModeVariant(hsl))
    const foreground = contrastRatio(primaryColor, '#ffffff') >= MIN_TEXT_CONTRAST ? '0 0% 100%' : '0 0% 7%'
    return [
        `:root{--primary:${light};--primary-foreground:${foreground};--ring:${light};`,
        `--sidebar-primary:${light};--sidebar-primary-foreground:${foreground};--sidebar-ring:${light};}`,
        `.dark{--primary:${dark};--primary-foreground:${foreground};--primary-fill:${light};--ring:${dark};`,
        `--sidebar-primary:${dark};--sidebar-ring:${dark};}`,
    ].join('')
}

function cleanText(value) {
    const clean = String(value ?? '').trim()
    return clean === '' ? null : clean
}

/**
 * Valida los textos y colores del look & feel.
 * @param {{ displayName?: string | null, primaryColor?: string | null, accentColor?: string | null, reportFooter?: string | null }} input
 * @returns {{ error: string } | { values: { displayName: string | null, primaryColor: string | null, accentColor: string | null, reportFooter: string | null } }}
 */
export function parseBranding({ displayName, primaryColor, accentColor, reportFooter }) {
    const values = {
        displayName: cleanText(displayName),
        primaryColor: cleanText(primaryColor),
        accentColor: cleanText(accentColor),
        reportFooter: cleanText(reportFooter),
    }
    if ((values.displayName?.length ?? 0) > DISPLAY_NAME_MAX) return { error: 'El nombre es demasiado largo.' }
    if ((values.reportFooter?.length ?? 0) > REPORT_FOOTER_MAX) return { error: 'El pie es demasiado largo.' }
    if (values.primaryColor && !isHexColor(values.primaryColor)) return { error: 'El color principal no es válido.' }
    if (values.accentColor && !isHexColor(values.accentColor)) return { error: 'El color de acento no es válido.' }
    return { values }
}
