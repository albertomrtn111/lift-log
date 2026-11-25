/**
 * Primer día del coach (/welcome, NXT-186). Lógica pura, testeada en
 * scripts/coach-setup.test.mjs: pasos, opciones, validación y el perfil que se
 * va componiendo en vivo mientras responde.
 *
 * Tres capítulos: sus datos (tu, negocio, disciplinas), su método (especialidad,
 * entrenamiento, nutrición, revisiones) y su voz (comunicación). El método se
 * guarda en coach_ai_profiles en cada paso y, al terminar, la IA lo convierte en
 * su perfil (solo en los planes con IA dentro de la app).
 */

/** @typedef {'tu' | 'negocio' | 'disciplinas' | 'especialidad' | 'entrenamiento' | 'nutricion' | 'revisiones' | 'comunicacion'} SetupStepId */
/** @typedef {'datos' | 'metodo' | 'voz'} SetupChapterId */

/** @type {{ id: SetupChapterId; title: string; subtitle: string }[]} */
export const SETUP_CHAPTERS = [
    { id: 'datos', title: 'Tú y tu negocio', subtitle: 'Tus datos y cómo te verán tus atletas' },
    { id: 'metodo', title: 'Tu método', subtitle: 'Cómo entrenas, cómo revisas y qué te importa' },
    { id: 'voz', title: 'Tu voz', subtitle: 'Cómo hablas con tus atletas' },
]

/** @type {{ id: SetupStepId; chapter: SetupChapterId }[]} */
export const SETUP_STEPS = [
    { id: 'tu', chapter: 'datos' },
    { id: 'negocio', chapter: 'datos' },
    { id: 'disciplinas', chapter: 'datos' },
    { id: 'especialidad', chapter: 'metodo' },
    { id: 'entrenamiento', chapter: 'metodo' },
    { id: 'nutricion', chapter: 'metodo' },
    { id: 'revisiones', chapter: 'metodo' },
    { id: 'comunicacion', chapter: 'voz' },
]

/** Pasos que se guardan en coach_ai_profiles */
export const METHOD_STEP_IDS = ['especialidad', 'entrenamiento', 'nutricion', 'revisiones', 'comunicacion']

// ─── Opciones ────────────────────────────────────────────────────────────

export const SPECIALTY_OPTIONS = ['Pérdida de grasa', 'Hipertrofia', 'Recomposición corporal', 'Fuerza', 'Powerlifting', 'Salud general', 'Híbrido (fuerza + cardio)', 'Running', 'Trail running', 'Resistencia', 'Deportes de equipo', 'Movilidad y funcional']
export const CLIENT_TYPE_OPTIONS = ['Mujeres', 'Hombres', 'Atletas', 'Sedentarios', 'Opositores', 'Mayores de 40', 'Jóvenes', 'Madres postparto', 'Personas con lesiones', 'Profesionales con poco tiempo']
export const LEVEL_OPTIONS = ['Principiantes', 'Intermedios', 'Avanzados', 'Élite / competición']
export const PRIORITY_OPTIONS = ['Progresión de carga', 'Técnica y forma', 'Adherencia', 'Volumen acumulado', 'Intensidad relativa (RIR/RPE)', 'Periodización', 'Especificidad', 'Recuperación', 'Frecuencia', 'Variedad']

export const PROGRESSION_OPTIONS = [
    { value: 'Doble progresión', hint: 'Primero más repeticiones, después más carga.' },
    { value: 'Por RIR / RPE', hint: 'La carga se ajusta al esfuerzo de cada serie.' },
    { value: 'Porcentajes de 1RM', hint: 'Cargas calculadas sobre la marca máxima.' },
    { value: 'Progresión lineal', hint: 'Un poco más cada semana mientras se pueda.' },
    { value: 'Según cómo llega el atleta', hint: 'Decido en cada sesión con sus sensaciones.' },
]

export const NUTRITION_TOOL_OPTIONS = [
    { value: 'Macros (proteína, carbos, grasa)', hint: 'Objetivos de calorías y macros por día.' },
    { value: 'Dieta de opciones', hint: 'Comidas cerradas con alternativas.' },
    { value: 'Enfoque mixto', hint: 'Macros con un menú de referencia.' },
    { value: 'Calorías + proteína mínima', hint: 'Lo justo para que sea fácil.' },
    { value: 'Sin calorías, solo hábitos', hint: 'Raciones, platos y rutinas.' },
]

export const NUTRITION_STALL_OPTIONS = [
    'Reviso la adherencia antes de tocar nada',
    'Bajo las calorías poco a poco',
    'Subo la actividad: pasos o cardio',
    'Hago una pausa de dieta',
]

export const METRICS_OPTIONS = [
    { value: 'Priorizo métricas objetivas', hint: 'Peso, cargas, medidas.' },
    { value: 'Equilibrio 50/50', hint: 'Datos y sensaciones por igual.' },
    { value: 'Priorizo sensaciones del cliente', hint: 'Cómo se siente manda.' },
    { value: 'Depende del contexto del atleta', hint: 'Cada caso es distinto.' },
]

export const REVIEW_FOCUS_OPTIONS = ['Adherencia al plan', 'Evolución del peso', 'Rendimiento en los entrenos', 'Sueño y recuperación', 'Fotos y medidas', 'Sensaciones y ánimo', 'Pasos y actividad']
export const ALERT_OPTIONS = ['Baja adherencia', 'Peso estancado 2+ semanas', 'Pérdida de peso muy rápida', 'Mal descanso', 'Dolor o molestias', 'Mucho cansancio', 'Días sin registrar']

export const TONE_OPTIONS = [
    {
        value: 'Cercano y motivador',
        sample: '¡Normal con la semana que has tenido, Lucía! Lo importante es que sigues aquí. Te dejo dos comidas más rápidas para estos días de lío y seguimos.',
    },
    {
        value: 'Directo y conciso',
        sample: 'Semana floja en la dieta por el trabajo. Cambio dos comidas por opciones rápidas. El resto, igual.',
    },
    {
        value: 'Profesional y técnico',
        sample: 'Lucía, la adherencia ha bajado al 60 % esta semana. Mantengo calorías y simplifico dos comidas para que encajen con tu horario.',
    },
    {
        value: 'Empático y comprensivo',
        sample: 'Entiendo que con tanto trabajo cueste, Lucía. Una semana así no estropea nada. Vamos a ponértelo más fácil con dos comidas rápidas.',
    },
    {
        value: 'Exigente y honesto',
        sample: 'Lucía, una semana así nos frena. Te pongo dos comidas rápidas para que no haya excusas: la próxima quiero verte por encima del 85 %.',
    },
    {
        value: 'Neutro y objetivo',
        sample: 'Adherencia a la dieta: 60 %. Motivo: carga de trabajo. Ajuste: dos comidas sustituidas por opciones rápidas.',
    },
]

export const RESPONSE_STYLE_OPTIONS = ['Respuestas cortas y directas', 'Respuestas detalladas', 'Con listas y puntos clave', 'Sin tecnicismos', 'Con justificación científica', 'Con ejemplos prácticos']

/** Mensaje del atleta al que responde el ejemplo de cada tono */
export const TONE_SAMPLE_MESSAGE = 'Esta semana me ha costado mucho cumplir la dieta, he tenido mucho lío en el trabajo.'

// ─── Pasos ───────────────────────────────────────────────────────────────

/** @param {unknown} value @returns {value is SetupStepId} */
export function isSetupStepId(value) {
    return SETUP_STEPS.some(step => step.id === value)
}

/**
 * Pasos que ve este coach: el de nutrición solo si trabaja la nutrición.
 * @param {string[]} disciplines
 */
export function visibleSetupSteps(disciplines) {
    const withNutrition = Array.isArray(disciplines) && disciplines.includes('nutrition')
    return SETUP_STEPS.filter(step => step.id !== 'nutricion' || withNutrition)
}

/**
 * Paso en el que retomar. Si el guardado ya no existe entre los visibles
 * (p. ej. quitó Nutrición o es de la versión anterior), vuelve al primero.
 * @param {string | null | undefined} saved
 * @param {string[]} disciplines
 * @returns {SetupStepId}
 */
export function resumeSetupStep(saved, disciplines) {
    const steps = visibleSetupSteps(disciplines)
    const found = steps.find(step => step.id === saved)
    return found ? found.id : steps[0].id
}

/**
 * Siguiente paso visible, o null si es el último.
 * @param {SetupStepId} current
 * @param {string[]} disciplines
 * @returns {SetupStepId | null}
 */
export function nextSetupStep(current, disciplines) {
    const steps = visibleSetupSteps(disciplines)
    const index = steps.findIndex(step => step.id === current)
    if (index === -1) return steps[0].id
    return steps[index + 1]?.id ?? null
}

// ─── Datos del coach ─────────────────────────────────────────────────────

/** @param {unknown} value */
function text(value) {
    return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value */
function oneLine(value) {
    return text(value).replace(/\s+/g, ' ')
}

/**
 * Teléfono tal como lo escribe, sin espacios sobrantes. Válido con 9 a 15 cifras.
 * @param {unknown} value
 */
export function normalizePhone(value) {
    const raw = oneLine(value)
    const digits = raw.replace(/\D/g, '')
    const valid = /^[+\d][\d\s().-]*$/.test(raw) && digits.length >= 9 && digits.length <= 15
    return { value: raw, valid }
}

/**
 * Usuario de Instagram sin @ ni dirección. Vacío si no lo pone.
 * @param {unknown} value
 */
export function normalizeInstagram(value) {
    let raw = text(value)
    raw = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '')
    const valid = raw === '' || /^[A-Za-z0-9._]{1,30}$/.test(raw)
    return { value: raw, valid }
}

/**
 * Web con https:// delante si no lo trae. Vacío si no la pone.
 * @param {unknown} value
 */
export function normalizeWebsite(value) {
    const raw = text(value)
    if (!raw) return { value: '', valid: true }
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
        const url = new URL(withProtocol)
        const valid = url.hostname.includes('.') && !/\s/.test(raw) && withProtocol.length <= 200
        return { value: withProtocol, valid }
    } catch {
        return { value: withProtocol, valid: false }
    }
}

/**
 * Paso «Sobre ti»: nombre, teléfono y ciudad.
 * @param {{ fullName?: unknown; phone?: unknown; city?: unknown }} input
 * @returns {{ ok: true; data: { fullName: string; phone: string; city: string } } | { ok: false; error: string; field: string }}
 */
export function validateAboutYou(input) {
    const fullName = oneLine(input.fullName)
    const city = oneLine(input.city)
    const phone = normalizePhone(input.phone)

    if (!fullName) return { ok: false, field: 'fullName', error: 'Escribe tu nombre y apellidos.' }
    if (fullName.length > 80) return { ok: false, field: 'fullName', error: 'El nombre es demasiado largo (máximo 80 caracteres).' }
    if (!phone.value) return { ok: false, field: 'phone', error: 'Escribe tu teléfono.' }
    if (!phone.valid) return { ok: false, field: 'phone', error: 'Revisa el teléfono: tiene que tener entre 9 y 15 cifras.' }
    if (!city) return { ok: false, field: 'city', error: 'Escribe tu ciudad.' }
    if (city.length > 80) return { ok: false, field: 'city', error: 'La ciudad es demasiado larga (máximo 80 caracteres).' }

    return { ok: true, data: { fullName, phone: phone.value, city } }
}

/**
 * Paso «Tu negocio»: nombre, Instagram y web.
 * @param {{ businessName?: unknown; instagram?: unknown; website?: unknown }} input
 * @returns {{ ok: true; data: { businessName: string; instagram: string | null; website: string | null } } | { ok: false; error: string; field: string }}
 */
export function validateBusiness(input) {
    const businessName = oneLine(input.businessName)
    const instagram = normalizeInstagram(input.instagram)
    const website = normalizeWebsite(input.website)

    if (!businessName) return { ok: false, field: 'businessName', error: 'Escribe el nombre de tu negocio.' }
    if (businessName.length > 80) return { ok: false, field: 'businessName', error: 'El nombre es demasiado largo (máximo 80 caracteres).' }
    if (!instagram.valid) return { ok: false, field: 'instagram', error: 'Revisa tu Instagram: solo el usuario, sin espacios.' }
    if (!website.valid) return { ok: false, field: 'website', error: 'Revisa la dirección de tu web.' }

    return { ok: true, data: { businessName, instagram: instagram.value || null, website: website.value || null } }
}

// ─── Método ──────────────────────────────────────────────────────────────

/** @param {unknown} value @returns {string[]} */
function list(value) {
    return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : []
}

/**
 * Las listas que se guardan como texto (lo primero que mira, alertas) se
 * escriben separadas por comas. Al volver, se reparten otra vez.
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitList(value) {
    return text(value).split(/\s*(?:,|·|\n|;)\s*/).map(item => item.trim()).filter(Boolean)
}

/** @param {string[]} items */
export function joinList(items) {
    return Array.from(new Set(list(items))).join(', ')
}

/**
 * Lo mínimo de cada paso del método. Lo demás es opcional.
 * @param {SetupStepId} step
 * @param {Record<string, unknown>} form
 * @returns {string | null} el error, o null si vale
 */
export function methodStepError(step, form) {
    switch (step) {
        case 'especialidad':
            return list(form.specialty).length > 0 ? null : 'Elige al menos una especialidad.'
        case 'entrenamiento':
            if (list(form.training_priorities).length === 0) return 'Elige al menos una prioridad al programar.'
            return text(form.progression_style) ? null : 'Elige cómo progresas la carga.'
        case 'nutricion':
            return text(form.macro_or_options) ? null : 'Elige con qué herramienta trabajas la dieta.'
        case 'revisiones':
            return text(form.metrics_vs_feelings) ? null : 'Elige cuánto pesan los datos frente a las sensaciones.'
        case 'comunicacion':
            return text(form.communication_tone) ? null : 'Elige el tono con el que hablas a tus atletas.'
        default:
            return null
    }
}

/** Campos de coach_ai_profiles que se pueden guardar desde el formulario */
export const METHOD_FIELDS = {
    text: [
        'training_philosophy', 'progression_style', 'training_avoid', 'exercise_preferences',
        'nutrition_approach', 'macro_or_options', 'nutrition_adjustment_priority',
        'nutrition_no_progress_action', 'nutrition_rules', 'checkin_priorities',
        'adjustment_signals', 'metrics_vs_feelings', 'review_structure_preference',
        'alert_types', 'communication_tone', 'free_notes', 'final_description',
    ],
    list: ['specialty', 'client_types', 'athlete_level', 'training_priorities', 'response_style'],
}

/**
 * Deja solo los campos conocidos, con textos recortados (máx. 4.000) y listas de textos.
 * @param {Record<string, unknown>} form
 */
export function sanitizeMethodForm(form) {
    /** @type {Record<string, string | string[]>} */
    const out = {}
    for (const key of METHOD_FIELDS.text) {
        if (key in form) out[key] = text(form[key]).slice(0, 4000)
    }
    for (const key of METHOD_FIELDS.list) {
        if (key in form) {
            const value = form[key]
            out[key] = Array.isArray(value)
                ? Array.from(new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))).slice(0, 20)
                : []
        }
    }
    return out
}

// ─── Perfil en vivo ──────────────────────────────────────────────────────

/** «a, b y c» */
function humanJoin(/** @type {string[]} */ items) {
    const clean = items.map(item => item.trim()).filter(Boolean)
    if (clean.length <= 1) return clean[0] ?? ''
    return `${clean.slice(0, -1).join(', ')} y ${clean[clean.length - 1]}`
}

function lower(/** @type {string} */ value) {
    return value ? value.charAt(0).toLowerCase() + value.slice(1) : value
}

/** Cada elemento en minúscula inicial, para meterlo en medio de una frase */
function lowerAll(/** @type {string[]} */ items) {
    return items.map(lower)
}

/** Cómo encaja cada opción (escrita en primera persona) en la frase del perfil */
const PROGRESSION_PHRASE = {
    'Doble progresión': 'con doble progresión',
    'Por RIR / RPE': 'por RIR / RPE',
    'Porcentajes de 1RM': 'con porcentajes de 1RM',
    'Progresión lineal': 'de forma lineal',
    'Según cómo llega el atleta': 'según cómo llega el atleta',
}

const LEVEL_PHRASE = {
    'Principiantes': 'principiante',
    'Intermedios': 'intermedio',
    'Avanzados': 'avanzado',
    'Élite / competición': 'élite',
}

const NUTRITION_TOOL_PHRASE = {
    'Sin calorías, solo hábitos': 'por hábitos, sin contar calorías',
}

const STALL_PHRASE = {
    'Reviso la adherencia antes de tocar nada': 'revisas la adherencia antes de tocar nada',
    'Bajo las calorías poco a poco': 'bajas las calorías poco a poco',
    'Subo la actividad: pasos o cardio': 'subes la actividad con pasos o cardio',
    'Hago una pausa de dieta': 'haces una pausa de dieta',
}

/** @param {Record<string, string>} table @param {string} value @param {string} fallback */
function phrase(table, value, fallback) {
    return table[value] ?? fallback
}

const METRICS_SENTENCE = {
    'Priorizo métricas objetivas': 'En las revisiones mandan los datos',
    'Equilibrio 50/50': 'En las revisiones pesan igual los datos y las sensaciones',
    'Priorizo sensaciones del cliente': 'En las revisiones mandan las sensaciones del atleta',
    'Depende del contexto del atleta': 'En las revisiones decides según el contexto de cada atleta',
}

/**
 * Frases del perfil que se va escribiendo mientras responde. Cada una aparece
 * cuando tiene datos; las que faltan no se inventan.
 * @param {{ disciplines?: string[]; method: Record<string, unknown> }} state
 * @returns {{ key: string; text: string }[]}
 */
export function describeMethod(state) {
    const m = state.method ?? {}
    /** @type {{ key: string; text: string }[]} */
    const lines = []

    const specialty = list(m.specialty)
    const clients = list(m.client_types)
    const levels = list(m.athlete_level)
    if (specialty.length) {
        let sentence = `Especialista en ${humanJoin(lowerAll(specialty))}`
        if (clients.length) sentence += `, sobre todo con ${humanJoin(lowerAll(clients))}`
        if (levels.length) sentence += ` de nivel ${humanJoin(levels.map(level => phrase(LEVEL_PHRASE, level, lower(level))))}`
        lines.push({ key: 'especialidad', text: `${sentence}.` })
    }

    const priorities = list(m.training_priorities)
    const progression = text(m.progression_style)
    if (priorities.length && progression) {
        lines.push({ key: 'entrenamiento', text: `Al programar priorizas ${humanJoin(lowerAll(priorities))}, y progresas ${phrase(PROGRESSION_PHRASE, progression, `con ${lower(progression)}`)}.` })
    } else if (priorities.length) {
        lines.push({ key: 'entrenamiento', text: `Al programar priorizas ${humanJoin(lowerAll(priorities))}.` })
    } else if (progression) {
        lines.push({ key: 'entrenamiento', text: `Progresas ${phrase(PROGRESSION_PHRASE, progression, `con ${lower(progression)}`)}.` })
    }

    const philosophy = oneLine(m.training_philosophy)
    if (philosophy) lines.push({ key: 'filosofia', text: `«${philosophy.replace(/[.«»"]+$/g, '')}».` })

    const tool = text(m.macro_or_options)
    const stall = text(m.nutrition_no_progress_action)
    if (tool) {
        let sentence = `En nutrición trabajas ${phrase(NUTRITION_TOOL_PHRASE, tool, `con ${lower(tool)}`)}`
        if (stall) sentence += `; si alguien se estanca, ${phrase(STALL_PHRASE, stall, lower(stall))}`
        lines.push({ key: 'nutricion', text: `${sentence}.` })
    }

    const metrics = text(m.metrics_vs_feelings)
    const focus = splitList(m.checkin_priorities)
    if (metrics || focus.length) {
        const base = METRICS_SENTENCE[/** @type {keyof typeof METRICS_SENTENCE} */ (metrics)] ?? (metrics ? `En las revisiones: ${lower(metrics)}` : 'En las revisiones')
        const sentence = focus.length ? `${base}, y lo primero que miras es ${humanJoin(lowerAll(focus))}` : base
        lines.push({ key: 'revisiones', text: `${sentence}.` })
    }

    const alerts = splitList(m.alert_types)
    if (alerts.length) lines.push({ key: 'alertas', text: `Quieres alertas de ${humanJoin(lowerAll(alerts))}.` })

    const tone = text(m.communication_tone)
    const style = list(m.response_style)
    if (tone) {
        let sentence = `Hablas con un tono ${lower(tone)}`
        if (style.length) sentence += `: ${humanJoin(lowerAll(style))}`
        lines.push({ key: 'voz', text: `${sentence}.` })
    }

    return lines
}

/**
 * Cuánto conoce ya su asistente (0-100). Cuenta lo obligatorio y lo que más
 * ayuda a la IA; nunca baja al avanzar.
 * @param {{ disciplines?: string[]; method: Record<string, unknown>; about?: Record<string, unknown> }} state
 */
export function profileCompletion(state) {
    const m = state.method ?? {}
    const withNutrition = Array.isArray(state.disciplines) && state.disciplines.includes('nutrition')
    const checks = [
        Boolean(text(state.about?.fullName)),
        Array.isArray(state.disciplines) && state.disciplines.length > 0,
        list(m.specialty).length > 0,
        list(m.client_types).length > 0,
        list(m.athlete_level).length > 0,
        list(m.training_priorities).length > 0,
        Boolean(text(m.progression_style)),
        Boolean(text(m.training_philosophy)),
        ...(withNutrition ? [Boolean(text(m.macro_or_options)), Boolean(text(m.nutrition_no_progress_action))] : []),
        Boolean(text(m.metrics_vs_feelings)),
        splitList(m.checkin_priorities).length > 0,
        splitList(m.alert_types).length > 0,
        Boolean(text(m.communication_tone)),
        list(m.response_style).length > 0,
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

/**
 * Iniciales para el avatar del negocio (o del coach si aún no hay negocio).
 * @param {string} name
 */
export function initialsOf(name) {
    const words = oneLine(name).split(' ').filter(word => /[\p{L}\p{N}]/u.test(word))
    if (words.length === 0) return 'NT'
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}
