import type { ReactNode } from 'react'
import { SpaceBrandingProvider } from '@/components/brand/SpaceBrandingContext'
import { brandingCss } from '@/lib/branding/branding-rules'
import { getMyBranding } from '@/lib/branding/get-branding'

/** Aplica los colores del espacio a toda la pantalla y comparte su logo y su nombre. */
export async function SpaceBranding({ children }: { children: ReactNode }) {
    const branding = await getMyBranding()
    if (!branding) return <>{children}</>

    // brandingCss solo devuelve CSS de un color hexadecimal validado.
    const css = brandingCss(branding.primary_color)
    return (
        <SpaceBrandingProvider
            brand={{
                displayName: branding.display_name,
                logoLightUrl: branding.logo_light_url,
                logoDarkUrl: branding.logo_dark_url,
            }}
        >
            {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
            {children}
        </SpaceBrandingProvider>
    )
}

/** Icono del espacio para la pestaña del navegador. */
export async function spaceBrandingMetadata() {
    const branding = await getMyBranding()
    if (!branding?.icon_url) return {}
    return { icons: { icon: branding.icon_url, apple: branding.icon_url } }
}
