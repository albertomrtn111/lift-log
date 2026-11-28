'use client'

/**
 * Preguntas del perfil de IA del coach («Enseña tu método»). Las usan el
 * formulario guiado de bienvenida y /coach/ai-onboarding (reconfigurar).
 */

import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CoachAIProfile } from '@/data/coach-ai-profile'

// ─────────────────────────────────────────────
// QuestionBlock — label + helper + field
// ─────────────────────────────────────────────

export function QuestionBlock({
    label,
    hint,
    children,
}: {
    label: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2.5">
            <div className="space-y-1">
                <Label className="text-[14px] font-semibold text-foreground leading-snug">
                    {label}
                </Label>
                {hint && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{hint}</p>
                )}
            </div>
            {children}
        </div>
    )
}

// ─────────────────────────────────────────────
// StyledTextarea — uses design system tokens
// ─────────────────────────────────────────────

export function StyledTextarea({
    value,
    onChange,
    placeholder,
    rows = 3,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    rows?: number
}) {
    return (
        <Textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary/30 text-sm leading-relaxed rounded-lg"
        />
    )
}

// ─────────────────────────────────────────────
// ChipSelect — chip multi/single selector
// ─────────────────────────────────────────────

export function ChipSelect({
    options,
    value,
    onChange,
    multiple = true,
}: {
    options: string[]
    value: string[]
    onChange: (v: string[]) => void
    multiple?: boolean
}) {
    const toggle = (opt: string) => {
        if (multiple) {
            onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
        } else {
            onChange(value.includes(opt) ? [] : [opt])
        }
    }
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => {
                const selected = value.includes(opt)
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(opt)}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium',
                            'border transition-all duration-150',
                            selected
                                ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                                : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5',
                        )}
                    >
                        {selected && <Check className="h-3 w-3 shrink-0" />}
                        {opt}
                    </button>
                )
            })}
        </div>
    )
}

// ─────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────

export interface FormState {
    specialty: string[]
    client_types: string[]
    athlete_level: string[]
    training_philosophy: string
    training_priorities: string[]
    progression_style: string
    training_avoid: string
    exercise_preferences: string
    nutrition_approach: string
    macro_or_options: string
    nutrition_adjustment_priority: string
    nutrition_no_progress_action: string
    nutrition_rules: string
    checkin_priorities: string
    adjustment_signals: string
    metrics_vs_feelings: string
    review_structure_preference: string
    alert_types: string
    communication_tone: string
    response_style: string[]
    free_notes: string
    final_description: string
}

export const INITIAL: FormState = {
    specialty: [], client_types: [], athlete_level: [],
    training_philosophy: '', training_priorities: [], progression_style: '',
    training_avoid: '', exercise_preferences: '',
    nutrition_approach: '', macro_or_options: '', nutrition_adjustment_priority: '',
    nutrition_no_progress_action: '', nutrition_rules: '',
    checkin_priorities: '', adjustment_signals: '', metrics_vs_feelings: '',
    review_structure_preference: '', alert_types: '',
    communication_tone: '', response_style: [], free_notes: '', final_description: '',
}

export function toInitialForm(profile?: CoachAIProfile | null): FormState {
    if (!profile) return INITIAL

    return {
        specialty: profile.specialty ?? [],
        client_types: profile.client_types ?? [],
        athlete_level: profile.athlete_level ?? [],
        training_philosophy: profile.training_philosophy ?? '',
        training_priorities: profile.training_priorities ?? [],
        progression_style: profile.progression_style ?? '',
        training_avoid: profile.training_avoid ?? '',
        exercise_preferences: profile.exercise_preferences ?? '',
        nutrition_approach: profile.nutrition_approach ?? '',
        macro_or_options: profile.macro_or_options ?? '',
        nutrition_adjustment_priority: profile.nutrition_adjustment_priority ?? '',
        nutrition_no_progress_action: profile.nutrition_no_progress_action ?? '',
        nutrition_rules: profile.nutrition_rules ?? '',
        checkin_priorities: profile.checkin_priorities ?? '',
        adjustment_signals: profile.adjustment_signals ?? '',
        metrics_vs_feelings: profile.metrics_vs_feelings ?? '',
        review_structure_preference: profile.review_structure_preference ?? '',
        alert_types: profile.alert_types ?? '',
        communication_tone: profile.communication_tone ?? '',
        response_style: profile.response_style ?? [],
        free_notes: profile.free_notes ?? '',
        final_description: profile.final_description ?? '',
    }
}

// ─────────────────────────────────────────────
// Step content components
// ─────────────────────────────────────────────

export function Step1({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Cuál es tu especialidad principal?"
                hint="Selecciona todas las que representen tu trabajo real con clientes."
            >
                <ChipSelect
                    options={['Pérdida de grasa', 'Hipertrofia', 'Recomposición corporal', 'Fuerza', 'Powerlifting', 'Salud general', 'Híbrido (fuerza + cardio)', 'Running', 'Trail running', 'Resistencia', 'Deportes de equipo', 'Movilidad y funcional']}
                    value={form.specialty}
                    onChange={v => setForm({ ...form, specialty: v })}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué tipo de clientes llevas principalmente?"
                hint="Piensa en quién es tu cliente típico hoy."
            >
                <ChipSelect
                    options={['Mujeres', 'Hombres', 'Atletas', 'Sedentarios', 'Opositores', 'Mayores de 40', 'Jóvenes', 'Madres postparto', 'Personas con lesiones', 'Profesionales con poco tiempo']}
                    value={form.client_types}
                    onChange={v => setForm({ ...form, client_types: v })}
                />
            </QuestionBlock>

            <QuestionBlock label="¿En qué nivel de atleta tienes más experiencia?">
                <ChipSelect
                    options={['Principiantes', 'Intermedios', 'Avanzados', 'Élite / competición']}
                    value={form.athlete_level}
                    onChange={v => setForm({ ...form, athlete_level: v })}
                />
            </QuestionBlock>
        </div>
    )
}

export function Step2({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Cómo defines tu filosofía de entrenamiento?"
                hint="En qué principios se basa tu forma de programar. Cuanto más honesto, mejor perfil generará la IA."
            >
                <StyledTextarea
                    value={form.training_philosophy}
                    onChange={v => setForm({ ...form, training_philosophy: v })}
                    placeholder="Ej: Me baso en evidencia científica. Priorizo la progresión de carga y el volumen acumulado. Creo que la consistencia a largo plazo supera cualquier protocolo intensivo..."
                    rows={4}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué priorizas más al programar?"
                hint="Selecciona hasta 3 aspectos que definan cómo construyes un plan."
            >
                <ChipSelect
                    options={['Progresión de carga', 'Volumen acumulado', 'Técnica y forma', 'Adherencia', 'Especificidad', 'Variedad', 'Frecuencia', 'Intensidad relativa (RIR/RPE)', 'Recuperación', 'Periodización']}
                    value={form.training_priorities}
                    onChange={v => setForm({ ...form, training_priorities: v })}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Cómo progresas la carga habitualmente?"
                hint="Describe tu método principal: progresión lineal, doble progresión, periodización ondulante..."
            >
                <StyledTextarea
                    value={form.progression_style}
                    onChange={v => setForm({ ...form, progression_style: v })}
                    placeholder="Ej: Uso doble progresión. Cuando el cliente completa todas las series en el rango superior de reps, subo peso la siguiente semana."
                    rows={2}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué errores quieres que la IA evite al proponer entrenamientos?"
                hint="Restricciones o malos hábitos de programación que no quieres que reproduzca."
            >
                <StyledTextarea
                    value={form.training_avoid}
                    onChange={v => setForm({ ...form, training_avoid: v })}
                    placeholder="Ej: No programar más de 5 días/semana en principiantes. No incluir ejercicios de alto riesgo sin progresión previa..."
                    rows={2}
                />
            </QuestionBlock>

            <QuestionBlock label="¿Tienes preferencias concretas sobre ejercicios o enfoques?">
                <StyledTextarea
                    value={form.exercise_preferences}
                    onChange={v => setForm({ ...form, exercise_preferences: v })}
                    placeholder="Ej: Prefiero sentadilla libre sobre hack squat. Incluyo trabajo unilateral siempre. Evito peso muerto rumano en mujeres sin experiencia previa..."
                    rows={2}
                />
            </QuestionBlock>
        </div>
    )
}

export function Step3({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Cómo trabajas la nutrición con tus clientes?"
                hint="Cuéntanos tu enfoque general. La IA lo sintetizará en tu perfil."
            >
                <StyledTextarea
                    value={form.nutrition_approach}
                    onChange={v => setForm({ ...form, nutrition_approach: v })}
                    placeholder="Ej: Trabajo con conteo de macros para clientes con experiencia. Para principiantes empiezo con dieta de opciones para facilitar la adherencia..."
                    rows={4}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué herramienta nutricional prefieres?"
                hint="Elige la que uses más habitualmente o que mejor representa tu metodología."
            >
                <ChipSelect
                    options={['Macros (proteína, carbos, grasa)', 'Dieta de opciones', 'Enfoque mixto', 'Sin calorías, solo hábitos', 'Dieta flexible', 'Calorías + proteína mínima']}
                    value={form.macro_or_options ? [form.macro_or_options] : []}
                    onChange={v => setForm({ ...form, macro_or_options: v[0] ?? '' })}
                    multiple={false}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué priorizas cuando necesitas ajustar una dieta?"
                hint="El orden de factores que evalúas antes de tocar los números."
            >
                <StyledTextarea
                    value={form.nutrition_adjustment_priority}
                    onChange={v => setForm({ ...form, nutrition_adjustment_priority: v })}
                    placeholder="Ej: Primero reviso adherencia real. Si es alta y no hay progreso, ajusto calorías. Nunca bajo de 1.8g proteína/kg..."
                    rows={2}
                />
            </QuestionBlock>

            <QuestionBlock label="¿Cómo actúas cuando un cliente no progresa pese a seguir la dieta?">
                <StyledTextarea
                    value={form.nutrition_no_progress_action}
                    onChange={v => setForm({ ...form, nutrition_no_progress_action: v })}
                    placeholder="Ej: Descarto primero problemas de adherencia. Si el seguimiento es real al 90%+, bajo 150-200 kcal de carbohidratos. La proteína no la toco..."
                    rows={2}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué reglas debe respetar siempre la IA en nutrición?"
                hint="Límites no negociables que aplicas a todos tus clientes."
            >
                <StyledTextarea
                    value={form.nutrition_rules}
                    onChange={v => setForm({ ...form, nutrition_rules: v })}
                    placeholder="Ej: Nunca bajar de 1600 kcal en mujeres. Siempre incluir proteína post-entreno. No recortar grasa por debajo de 0.7g/kg..."
                    rows={2}
                />
            </QuestionBlock>
        </div>
    )
}

export function Step4({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Qué valoras más al revisar a un atleta?"
                hint="Qué información buscas primero cuando recibes una revisión."
            >
                <StyledTextarea
                    value={form.checkin_priorities}
                    onChange={v => setForm({ ...form, checkin_priorities: v })}
                    placeholder="Ej: La evolución del peso semana a semana, la adherencia real al plan, las sensaciones en el entrenamiento y la calidad del descanso..."
                    rows={3}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué señales te llevan a decidir un ajuste?"
                hint="Los triggers concretos que te hacen cambiar algo en el plan."
            >
                <StyledTextarea
                    value={form.adjustment_signals}
                    onChange={v => setForm({ ...form, adjustment_signals: v })}
                    placeholder="Ej: 2-3 semanas sin cambios con buena adherencia. Fatiga crónica sostenida. Pérdida de fuerza mantenida más de una semana..."
                    rows={3}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Cuánto peso das a las métricas frente a las sensaciones?"
                hint="Esto define cómo la IA ponderará los datos de la revisión."
            >
                <ChipSelect
                    options={['Priorizo métricas objetivas', 'Equilibrio 50/50', 'Priorizo sensaciones del cliente', 'Depende del contexto del atleta']}
                    value={form.metrics_vs_feelings ? [form.metrics_vs_feelings] : []}
                    onChange={v => setForm({ ...form, metrics_vs_feelings: v[0] ?? '' })}
                    multiple={false}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Cómo quieres que la IA estructure sus propuestas de revisión?"
                hint="El orden o formato que prefieres para recibir el análisis y las recomendaciones."
            >
                <StyledTextarea
                    value={form.review_structure_preference}
                    onChange={v => setForm({ ...form, review_structure_preference: v })}
                    placeholder="Ej: Primero resumen de la semana, después análisis de métricas, luego propuestas concretas de ajuste con justificación. Directo al grano..."
                    rows={2}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Qué alertas o banderas quieres que la IA detecte automáticamente?"
                hint="Señales de riesgo que siempre debes saber antes de continuar."
            >
                <StyledTextarea
                    value={form.alert_types}
                    onChange={v => setForm({ ...form, alert_types: v })}
                    placeholder="Ej: Pérdida de peso >1% semanal. Señales de sobreentrenamiento. Adherencia baja repetida. Cambios bruscos en sueño o estrés..."
                    rows={2}
                />
            </QuestionBlock>
        </div>
    )
}

export function Step5({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Qué tono quieres que use la IA contigo?"
                hint="Esto define cómo te presentará análisis y propuestas."
            >
                <ChipSelect
                    options={['Profesional y técnico', 'Cercano y motivador', 'Directo y conciso', 'Empático y comprensivo', 'Neutro y objetivo', 'Exigente y honesto']}
                    value={form.communication_tone ? [form.communication_tone] : []}
                    onChange={v => setForm({ ...form, communication_tone: v[0] ?? '' })}
                    multiple={false}
                />
            </QuestionBlock>

            <QuestionBlock label="¿Cómo prefieres que estructure sus respuestas?">
                <ChipSelect
                    options={['Respuestas cortas y directas', 'Respuestas detalladas', 'Con listas y puntos clave', 'Con justificación científica', 'Sin tecnicismos', 'Con ejemplos prácticos']}
                    value={form.response_style}
                    onChange={v => setForm({ ...form, response_style: v })}
                />
            </QuestionBlock>

            <QuestionBlock
                label="¿Algo más que la IA deba saber sobre cómo trabajas?"
                hint="Reglas especiales, contexto del negocio o cualquier cosa que no encaje en las preguntas anteriores."
            >
                <StyledTextarea
                    value={form.free_notes}
                    onChange={v => setForm({ ...form, free_notes: v })}
                    placeholder="Ej: Trabajo solo online con clientes de España. Uso un protocolo propio de fases de 12 semanas. No trabajo con atletas de competición..."
                    rows={3}
                />
            </QuestionBlock>

            <QuestionBlock
                label="Descríbete como coach. ¿Cómo quieres que la IA piense como tú?"
                hint="Esta es la pregunta más importante. Habla en primera persona y sé específico. Cuanto más detallado, más personalizado será tu perfil IA."
            >
                <StyledTextarea
                    value={form.final_description}
                    onChange={v => setForm({ ...form, final_description: v })}
                    placeholder="Ej: Soy un entrenador que prioriza la salud a largo plazo sobre resultados rápidos. Creo que un cliente informado sigue mejor el plan. Me gusta explicar el porqué de cada decisión. No creo en los protocolos genéricos — adapto todo a la vida real del atleta..."
                    rows={6}
                />
            </QuestionBlock>
        </div>
    )
}

