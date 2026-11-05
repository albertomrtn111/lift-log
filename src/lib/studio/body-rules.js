/** Reglas de la ficha del cliente, sin dependencias de la app para poder probarlas con node --test. */
import { BODY_REGIONS, BODY_STRUCTURES, MUSCLE_INJURIES } from './body-map.js'

export function regionLabel(regionId) {
    return BODY_REGIONS.find(region => region.id === regionId)?.label ?? regionId
}

/** Estructuras de una zona: las suyas, sin distinguir lado, o las lesiones musculares si es un músculo. */
export function structuresFor(regionId) {
    const base = regionId.replace(/_(d|i)$/, '')
    if (BODY_STRUCTURES[base]) return BODY_STRUCTURES[base]
    return BODY_REGIONS.find(region => region.id === regionId)?.kind === 'mus' ? MUSCLE_INJURIES : []
}

/** Las activas primero y, dentro de cada grupo, las últimas que se tocaron. */
export function sortInjuries(injuries) {
    return [...injuries].sort((a, b) =>
        Number(a.status !== 'active') - Number(b.status !== 'active')
        || String(b.updated_at).localeCompare(String(a.updated_at)))
}

/** Cómo se marca cada zona: si tiene una activa, activa. */
export function regionStates(injuries) {
    const states = new Map()
    for (const injury of injuries) {
        if (injury.status === 'active') states.set(injury.region, 'active')
        else if (!states.has(injury.region)) states.set(injury.region, 'past')
    }
    return states
}

export function emptyInjuryForm(region) {
    return { id: null, version: null, region, structure: '', detail: '', occurred: '', status: 'active' }
}

export function injuryToForm(injury) {
    return {
        id: injury.id,
        version: injury.version,
        region: injury.region,
        structure: injury.structure ?? '',
        detail: injury.detail ?? '',
        occurred: injury.occurred ?? '',
        status: injury.status,
    }
}

/** Campos para studio_save_injury, o el error que hay que enseñar. */
export function injuryFields(form) {
    if (!form.structure.trim() && !form.detail.trim()) return { error: 'Elige una estructura o escribe qué pasó.' }
    if (form.detail.length > 1000) return { error: 'El detalle es demasiado largo.' }
    if (form.occurred.length > 80) return { error: 'La fecha es demasiado larga.' }
    return {
        fields: {
            region: form.region,
            structure: form.structure.trim() || null,
            detail: form.detail.trim() || null,
            occurred: form.occurred.trim() || null,
            status: form.status,
        },
    }
}
