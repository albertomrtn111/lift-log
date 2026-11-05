'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface SpaceBrand {
    displayName: string | null
    logoLightUrl: string | null
    logoDarkUrl: string | null
}

const SpaceBrandingContext = createContext<SpaceBrand | null>(null)

export function SpaceBrandingProvider({ brand, children }: { brand: SpaceBrand | null; children: ReactNode }) {
    return <SpaceBrandingContext.Provider value={brand}>{children}</SpaceBrandingContext.Provider>
}

/** Marca del espacio; null si se ve la de NexTrain. */
export function useSpaceBranding() {
    return useContext(SpaceBrandingContext)
}
