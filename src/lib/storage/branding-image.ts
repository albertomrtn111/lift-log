import 'server-only'

import sharp from 'sharp'

const LOGO_MAX_SIDE = 800
const ICON_SIDE = 512

/**
 * Logos e iconos en PNG: sirve para la web, los emails y los PDF, y un SVG deja de
 * ser un fichero con código. Devuelve null si la imagen no se puede leer.
 */
export async function toBrandingPng(input: Uint8Array, slot: string, isSvg: boolean): Promise<Uint8Array | null> {
    if (isSvg && /<!ENTITY|<script/i.test(Buffer.from(input).toString('utf8'))) return null
    try {
        const image = sharp(input, { failOn: 'error', ...(isSvg ? { density: 300 } : {}) }).rotate()
        const resized = slot === 'icon'
            ? image.resize({
                width: ICON_SIDE,
                height: ICON_SIDE,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            : image.resize({ width: LOGO_MAX_SIDE, height: LOGO_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        return new Uint8Array(await resized.png({ compressionLevel: 9 }).toBuffer())
    } catch (error) {
        console.warn('[branding] No se pudo leer la imagen:', error instanceof Error ? error.message : error)
        return null
    }
}
