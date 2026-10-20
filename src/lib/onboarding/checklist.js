/**
 * Tarjeta "Primeros pasos" del panel del coach. Lógica pura (testeada en scripts/).
 *
 * @typedef {{
 *   guided?: boolean
 *   checklist_dismissed_at?: string
 *   sample_explored_at?: string
 * }} ChecklistState
 *
 * @typedef {{
 *   state: ChecklistState
 *   sampleClientId: string | null
 *   firstRealClientId: string | null
 *   realClientCount: number
 *   hasFirstPlan: boolean
 *   aiProfileApproved: boolean
 * }} ChecklistInput
 *
 * @typedef {{
 *   id: 'workspace' | 'sample' | 'invite' | 'plan' | 'ai'
 *   title: string
 *   description: string
 *   done: boolean
 *   optional: boolean
 *   href: string | null
 *   cta: string
 *   blockedReason: string | null
 * }} ChecklistStep
 *
 * @typedef {{
 *   visible: boolean
 *   steps: ChecklistStep[]
 *   requiredDone: number
 *   requiredTotal: number
 *   progress: number
 * }} Checklist
 */

/**
 * @param {ChecklistInput} input
 * @returns {Checklist}
 */
export function buildCoachChecklist(input) {
    const { state, sampleClientId, firstRealClientId, realClientCount, hasFirstPlan, aiProfileApproved } = input
    const guided = Boolean(state.guided)

    /** @type {ChecklistStep[]} */
    const steps = [
        {
            id: 'workspace',
            title: 'Crea tu espacio',
            description: 'Ya lo tienes: tu panel está listo.',
            done: true,
            optional: false,
            href: null,
            cta: '',
            blockedReason: null,
        },
    ]

    // Coaches anteriores al onboarding guiado no tienen atleta de ejemplo
    if (guided || sampleClientId) {
        steps.push({
            id: 'sample',
            title: 'Explora a Lucía, tu atleta de ejemplo',
            description: 'Abre su revisión de esta semana y pulsa "Aprobar y enviar" para ver qué recibe el atleta.',
            // Si la borra sin explorarla, el paso deja de tener sentido
            done: Boolean(state.sample_explored_at) || !sampleClientId,
            optional: false,
            href: sampleClientId ? `/coach/clients?client=${sampleClientId}&tab=checkins&guide=sample` : null,
            cta: 'Ver a Lucía',
            blockedReason: null,
        })
    }

    steps.push(
        {
            id: 'invite',
            title: 'Invita a tu primer atleta',
            description: 'Solo necesitas su nombre y su email.',
            done: realClientCount > 0,
            optional: false,
            href: '/coach/members?invite=1',
            cta: 'Invitar atleta',
            blockedReason: null,
        },
        {
            id: 'plan',
            title: 'Prepara su primer plan',
            description: 'Desde una plantilla, importando un CSV o generado con IA a partir de su onboarding.',
            done: hasFirstPlan,
            optional: false,
            href: firstRealClientId ? `/coach/clients?client=${firstRealClientId}&tab=plan&guide=first-plan` : null,
            cta: 'Preparar plan',
            blockedReason: firstRealClientId ? null : 'Primero invita a un atleta.',
        },
        {
            id: 'ai',
            title: 'Enseña tu método a la IA',
            description: 'Para que los análisis suenen como tú. Unos 5 minutos.',
            done: aiProfileApproved,
            optional: true,
            href: '/coach/ai-onboarding',
            cta: 'Configurar IA',
            blockedReason: null,
        },
    )

    const required = steps.filter(step => !step.optional)
    const requiredDone = required.filter(step => step.done).length
    const requiredTotal = required.length
    const allRequiredDone = requiredDone === requiredTotal

    const dismissed = Boolean(state.checklist_dismissed_at)
    // Coach nuevo: hasta completarla. Coach anterior: solo mientras no tenga atletas reales.
    const visible = !dismissed && !allRequiredDone && (guided || realClientCount === 0)

    return {
        visible,
        steps,
        requiredDone,
        requiredTotal,
        progress: requiredTotal === 0 ? 1 : requiredDone / requiredTotal,
    }
}
