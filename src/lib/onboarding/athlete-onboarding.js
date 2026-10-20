/**
 * Bienvenida del atleta: los cuatro pasos y los tiempos estimados.
 * Lógica pura (testeada en scripts/).
 *
 * @typedef {'done' | 'skipped'} StepResolution
 * @typedef {{ guided?: boolean, password_set_at?: string, install?: StepResolution, push?: StepResolution, watch?: StepResolution, completed_at?: string }} AthleteOnboardingState
 * @typedef {'install' | 'push' | 'watch' | 'form'} AthleteStepId
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
 *   stravaConnected: boolean
 *   form: 'none' | 'pending' | 'completed'
 *   formMinutes: number
 * }} input
 * @returns {{ steps: AthleteStep[], currentIndex: number, complete: boolean }}
 */
export function buildAthleteSteps(input) {
    const { state } = input
    /** @type {AthleteStep[]} */
    const steps = [
        { id: 'install', title: 'Instalar la app', duration: '1 min', optional: false, resolved: Boolean(state.install) },
        { id: 'push', title: 'Activar los avisos', duration: '30 s', optional: false, resolved: Boolean(state.push) || input.hasPushSubscription },
        { id: 'watch', title: 'Conectar tu reloj', duration: '1 min', optional: true, resolved: Boolean(state.watch) || input.stravaConnected },
        { id: 'form', title: 'Formulario de tu entrenador', duration: formatMinutes(input.formMinutes), optional: false, resolved: input.form !== 'pending' },
    ]
    const currentIndex = steps.findIndex(step => !step.resolved)
    return { steps, currentIndex, complete: currentIndex === -1 }
}
