/**
 * Bienvenida del atleta: cómo funciona la app, los pasos de configuración y
 * el formulario del coach, con sus tiempos estimados.
 * Lógica pura (testeada en scripts/).
 *
 * @typedef {'done' | 'skipped'} StepResolution
 * @typedef {{ guided?: boolean, password_set_at?: string, tour?: StepResolution, install?: StepResolution, push?: StepResolution, photo?: StepResolution, watch?: StepResolution, completed_at?: string }} AthleteOnboardingState
 * @typedef {'tour' | 'install' | 'push' | 'photo' | 'watch' | 'form'} AthleteStepId
 * @typedef {{ id: AthleteStepId, title: string, duration: string, optional: boolean, resolved: boolean }} AthleteStep
 */

/** Segundos aproximados para contestar cada tipo de pregunta */
const SECONDS_BY_TYPE = {
    short_text: 20,
    long_text: 45,
    number: 10,
    date: 10,
    scale: 8,
    single_choice: 8,
    multi_choice: 12,
    photo_upload: 60,
}

/**
 * Agrupa las preguntas en secciones (campo `section`) con su tiempo estimado.
 * Las preguntas antes de la primera sección van en "Preguntas".
 * @param {{ type: string, section?: string }[]} fields
 * @returns {{ title: string, questions: number, minutes: number }[]}
 */
export function estimateFormSections(fields) {
    /** @type {{ title: string, questions: number, seconds: number }[]} */
    const sections = []
    for (const field of fields) {
        if (field.section || sections.length === 0) {
            sections.push({ title: field.section || (field.type === 'photo_upload' ? 'Fotos' : 'Preguntas'), questions: 0, seconds: 0 })
        }
        if (field.type === 'photo_upload' && sections[sections.length - 1].questions > 0) {
            sections.push({ title: 'Fotos', questions: 0, seconds: 0 })
        }
        const current = sections[sections.length - 1]
        current.questions += 1
        current.seconds += SECONDS_BY_TYPE[field.type] ?? 20
    }
    return sections
        .filter(section => section.questions > 0)
        .map(section => ({ title: section.title, questions: section.questions, minutes: Math.max(1, Math.round(section.seconds / 60)) }))
}

/** @param {number} minutes */
export function formatMinutes(minutes) {
    return minutes <= 1 ? '1 min' : `${minutes} min`
}

/**
 * @param {{
 *   state: AthleteOnboardingState
 *   hasPushSubscription: boolean
 *   hasAvatar: boolean
 *   stravaConnected: boolean
 *   form: 'none' | 'pending' | 'completed'
 *   formMinutes: number
 * }} input
 * @returns {{ steps: AthleteStep[], currentIndex: number, complete: boolean }}
 */
export function buildAthleteSteps(input) {
    const { state } = input
    const pushResolved = Boolean(state.push) || input.hasPushSubscription
    const watchResolved = Boolean(state.watch) || input.stravaConnected
    const formResolved = input.form !== 'pending'
    // «Cómo funciona» y la foto se añadieron el 01-11-2026. Quien ya había
    // terminado la bienvenida no vuelve a ella: la foto se le pide con el aviso
    // de novedades (src/lib/announcements/catalog.js).
    const finishedBeforeNewSteps = !state.tour && !state.photo
        && Boolean(state.install) && pushResolved && watchResolved && formResolved
    /** @type {AthleteStep[]} */
    const steps = [
        { id: 'tour', title: 'Cómo funciona la app', duration: '30 s', optional: false, resolved: Boolean(state.tour) || finishedBeforeNewSteps },
        { id: 'install', title: 'Instalar la app', duration: '1 min', optional: false, resolved: Boolean(state.install) },
        { id: 'push', title: 'Activar los avisos', duration: '30 s', optional: false, resolved: pushResolved },
        { id: 'photo', title: 'Poner tu foto de perfil', duration: '30 s', optional: false, resolved: Boolean(state.photo) || input.hasAvatar || finishedBeforeNewSteps },
        { id: 'watch', title: 'Conectar tu reloj', duration: '1 min', optional: true, resolved: watchResolved },
        { id: 'form', title: 'Formulario de tu entrenador', duration: formatMinutes(input.formMinutes), optional: false, resolved: formResolved },
    ]
    const currentIndex = steps.findIndex(step => !step.resolved)
    return { steps, currentIndex, complete: currentIndex === -1 }
}
