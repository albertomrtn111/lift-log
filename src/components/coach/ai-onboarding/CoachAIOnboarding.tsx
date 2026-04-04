'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { saveOnboardingStep, approveCoachAIProfile } from './actions'
import type { CoachAIProfileOutput } from '@/lib/ai/generate-coach-profile'
import {
    Loader2,
    ChevronRight,
    ChevronLeft,
    Sparkles,
    CheckCircle2,
    Brain,
    Dumbbell,
    Apple,
    ClipboardList,
    MessageSquare,
    Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────
// QuestionBlock — label + helper + field
// ─────────────────────────────────────────────

function QuestionBlock({
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

function StyledTextarea({
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

function ChipSelect({
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

interface FormState {
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

const INITIAL: FormState = {
    specialty: [], client_types: [], athlete_level: [],
    training_philosophy: '', training_priorities: [], progression_style: '',
    training_avoid: '', exercise_preferences: '',
    nutrition_approach: '', macro_or_options: '', nutrition_adjustment_priority: '',
    nutrition_no_progress_action: '', nutrition_rules: '',
    checkin_priorities: '', adjustment_signals: '', metrics_vs_feelings: '',
    review_structure_preference: '', alert_types: '',
    communication_tone: '', response_style: [], free_notes: '', final_description: '',
}

// ─────────────────────────────────────────────
// Step content components
// ─────────────────────────────────────────────

function Step1({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
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

function Step2({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
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

function Step3({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
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

function Step4({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
    return (
        <div className="space-y-8">
            <QuestionBlock
                label="¿Qué valoras más al revisar a un atleta?"
                hint="Qué información buscas primero cuando recibes un check-in."
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
                hint="Esto define cómo la IA ponderará los datos del check-in."
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

function Step5({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
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

function StepSummary({
    form,
    onGenerate,
    isGenerating,
}: {
    form: FormState
    onGenerate: () => void
    isGenerating: boolean
}) {
    const rows = [
        { label: 'Especialidad', value: form.specialty.join(', ') || '—' },
        { label: 'Tipo de cliente', value: form.client_types.join(', ') || '—' },
        { label: 'Nivel atleta', value: form.athlete_level.join(', ') || '—' },
        { label: 'Filosofía entreno', value: form.training_philosophy || '—' },
        { label: 'Prioridades', value: form.training_priorities.join(', ') || '—' },
        { label: 'Herramienta nutri.', value: form.macro_or_options || '—' },
        { label: 'Enfoque nutricional', value: form.nutrition_approach || '—' },
        { label: 'Tono', value: form.communication_tone || '—' },
    ]

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-border overflow-hidden">
                {rows.map((row, i) => (
                    <div
                        key={row.label}
                        className={cn(
                            'flex gap-4 px-4 py-3 text-sm',
                            i % 2 === 0 ? 'bg-background' : 'bg-muted/40',
                        )}
                    >
                        <span className="text-muted-foreground w-36 shrink-0 font-medium">{row.label}</span>
                        <span className="text-foreground line-clamp-2">{row.value}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1">
                <p className="text-sm font-semibold text-primary">Listo para generar tu perfil IA</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    La IA analizará todas tus respuestas y creará una configuración personalizada para entrenamiento, nutrición y revisiones. Podrás revisarla antes de activarla.
                </p>
            </div>

            <Button
                size="lg"
                className="w-full gap-2 h-11"
                onClick={onGenerate}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando tu perfil IA...
                    </>
                ) : (
                    <>
                        <Sparkles className="h-4 w-4" />
                        Generar perfil IA
                    </>
                )}
            </Button>
        </div>
    )
}

// ─────────────────────────────────────────────
// Profile review screen
// ─────────────────────────────────────────────

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</h3>
            {children}
        </div>
    )
}

function ReviewCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border border-border bg-card p-5 shadow-sm', className)}>
            {children}
        </div>
    )
}

function ProfileReview({
    output,
    onApprove,
    isApproving,
}: {
    output: CoachAIProfileOutput
    onApprove: () => void
    isApproving: boolean
}) {
    return (
        <div className="space-y-6">
            <ReviewBlock title="Resumen del coach">
                <ReviewCard>
                    <p className="text-sm text-foreground leading-relaxed">{output.professional_summary}</p>
                </ReviewCard>
            </ReviewBlock>

            <ReviewBlock title="Metodología">
                <div className="space-y-2">
                    {[
                        { icon: Dumbbell, label: 'Entrenamiento', text: output.methodology.training },
                        { icon: Apple, label: 'Nutrición', text: output.methodology.nutrition },
                        { icon: ClipboardList, label: 'Revisiones', text: output.methodology.reviews },
                    ].map(({ icon: Icon, label, text }) => (
                        <ReviewCard key={label}>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="h-3.5 w-3.5 text-primary" />
                                <span className="text-xs font-semibold text-primary">{label}</span>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{text}</p>
                        </ReviewCard>
                    ))}
                </div>
            </ReviewBlock>

            <ReviewBlock title="Estilo de comunicación">
                <ReviewCard>
                    <p className="text-sm text-foreground leading-relaxed">{output.communication_style}</p>
                </ReviewCard>
            </ReviewBlock>

            <ReviewBlock title="Reglas maestras">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ReviewCard>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-3">Siempre hacer</p>
                        <ul className="space-y-2">
                            {output.master_rules.always_do.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="text-green-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                    <ReviewCard>
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3">Nunca hacer</p>
                        <ul className="space-y-2">
                            {output.master_rules.never_do.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                    <ReviewCard>
                        <p className="text-xs font-semibold text-primary mb-3">Criterios clave</p>
                        <ul className="space-y-2">
                            {output.master_rules.decision_criteria.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                </div>
            </ReviewBlock>

            <ReviewBlock title="Configuración base de IA">
                <ReviewCard>
                    <p className="text-xs text-muted-foreground mb-3">
                        Este bloque se usará como contexto base en todas las funcionalidades IA del sistema.
                    </p>
                    <div className="bg-muted rounded-lg p-4 text-xs text-muted-foreground leading-relaxed font-mono max-h-44 overflow-y-auto">
                        {output.system_prompt}
                    </div>
                </ReviewCard>
            </ReviewBlock>

            <Button
                size="lg"
                className="w-full gap-2 h-11"
                onClick={onApprove}
                disabled={isApproving}
            >
                {isApproving ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aprobando perfil...
                    </>
                ) : (
                    <>
                        <CheckCircle2 className="h-4 w-4" />
                        Aprobar perfil y entrar a la aplicación
                    </>
                )}
            </Button>
        </div>
    )
}

// ─────────────────────────────────────────────
// Step config
// ─────────────────────────────────────────────

const STEP_CONFIG = [
    { title: 'Especialidad y clientes', subtitle: 'Define tu nicho y tipo de cliente', icon: Brain },
    { title: 'Entrenamiento', subtitle: 'Tu filosofía y forma de programar', icon: Dumbbell },
    { title: 'Nutrición', subtitle: 'Tu enfoque y reglas con la dieta', icon: Apple },
    { title: 'Revisiones', subtitle: 'Cómo analizas y decides ajustes', icon: ClipboardList },
    { title: 'Comunicación', subtitle: 'Tu tono y configuración final', icon: MessageSquare },
    { title: 'Resumen', subtitle: 'Revisa y genera tu perfil IA', icon: Sparkles },
]

const TOTAL_STEPS = STEP_CONFIG.length

// ─────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
    return (
        <div className="flex items-center justify-between relative px-1">
            {/* base line */}
            <div className="absolute top-[13px] left-4 right-4 h-px bg-border" />
            {/* progress line */}
            <div
                className="absolute top-[13px] left-4 h-px bg-primary transition-all duration-500"
                style={{ width: `calc(${((step - 1) / (TOTAL_STEPS - 1)) * 100}% - 8px)` }}
            />
            {STEP_CONFIG.map((s, i) => {
                const num = i + 1
                const done = num < step
                const current = num === step
                return (
                    <div key={num} className="flex flex-col items-center gap-1.5 z-10">
                        <div
                            className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 border',
                                done
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : current
                                        ? 'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20'
                                        : 'bg-background border-border text-muted-foreground',
                            )}
                        >
                            {done ? <Check className="h-3.5 w-3.5" /> : num}
                        </div>
                        <span
                            className={cn(
                                'text-[10px] font-medium text-center leading-tight hidden sm:block max-w-[56px]',
                                current ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground',
                            )}
                        >
                            {s.title.split(' ')[0]}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function CoachAIOnboarding() {
    const router = useRouter()
    const { toast } = useToast()

    const [step, setStep] = useState(1)
    const [form, setForm] = useState<FormState>(INITIAL)
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [generatedOutput, setGeneratedOutput] = useState<CoachAIProfileOutput | null>(null)

    const currentConfig = STEP_CONFIG[step - 1]
    const StepIcon = currentConfig.icon

    const saveCurrentStep = async (): Promise<boolean> => {
        setIsSaving(true)
        const result = await saveOnboardingStep(form)
        setIsSaving(false)
        if (!result.success) {
            toast({ title: 'Error al guardar', description: result.error, variant: 'destructive' })
            return false
        }
        return true
    }

    const handleNext = async () => {
        const ok = await saveCurrentStep()
        if (ok) setStep(s => Math.min(s + 1, TOTAL_STEPS))
    }

    const handleBack = () => setStep(s => Math.max(s - 1, 1))

    const handleGenerate = async () => {
        const saved = await saveCurrentStep()
        if (!saved) return

        setIsGenerating(true)
        try {
            const res = await fetch('/api/ai/generate-coach-profile', { method: 'POST' })
            const data = await res.json()
            if (!data.success) {
                toast({ title: 'Error al generar el perfil', description: data.error, variant: 'destructive' })
                return
            }
            setGeneratedOutput(data.output as CoachAIProfileOutput)
        } catch {
            toast({ title: 'Error de conexión', description: 'No se pudo conectar con el servidor.', variant: 'destructive' })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleApprove = async () => {
        setIsApproving(true)
        const result = await approveCoachAIProfile()
        if (!result.success) {
            toast({ title: 'Error al aprobar', description: result.error, variant: 'destructive' })
            setIsApproving(false)
            return
        }
        router.push('/coach/dashboard')
        router.refresh()
    }

    // ── Generated profile review ──
    if (generatedOutput) {
        return (
            <div className="min-h-screen bg-background">
                <div className="max-w-2xl mx-auto px-4 py-10 pb-24">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
                            <CheckCircle2 className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Tu perfil IA está listo</h1>
                        <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
                            Revisa lo que la IA ha sintetizado sobre tu metodología. Si estás de acuerdo, apruébalo para activar la personalización.
                        </p>
                    </div>
                    <ProfileReview output={generatedOutput} onApprove={handleApprove} isApproving={isApproving} />
                </div>
            </div>
        )
    }

    // ── Wizard ──
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-2xl mx-auto px-4 py-8 pb-28">

                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 text-primary mb-3">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-widest">Perfil IA del coach</span>
                    </div>
                    <div className="flex items-end justify-between mb-1">
                        <h1 className="text-2xl font-bold text-foreground">Configura tu IA personal</h1>
                        <span className="text-sm text-muted-foreground shrink-0 ml-4 font-medium">
                            {step} / {TOTAL_STEPS}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                        La IA aprenderá tu metodología y trabajará como una extensión de ti.
                    </p>

                    {/* Stepper */}
                    <Stepper step={step} />
                </div>

                {/* Step card */}
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden mb-6">
                    {/* Step header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <StepIcon className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">{currentConfig.title}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">{currentConfig.subtitle}</p>
                        </div>
                    </div>

                    {/* Step content */}
                    <div className="px-6 py-7">
                        {step === 1 && <Step1 form={form} setForm={setForm} />}
                        {step === 2 && <Step2 form={form} setForm={setForm} />}
                        {step === 3 && <Step3 form={form} setForm={setForm} />}
                        {step === 4 && <Step4 form={form} setForm={setForm} />}
                        {step === 5 && <Step5 form={form} setForm={setForm} />}
                        {step === 6 && (
                            <StepSummary form={form} onGenerate={handleGenerate} isGenerating={isGenerating} />
                        )}
                    </div>
                </div>

                {/* Navigation */}
                {step < 6 && (
                    <div className="fixed bottom-0 left-0 right-0 sm:relative bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none border-t border-border sm:border-0 px-4 py-4 sm:px-0 sm:py-0">
                        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
                            <Button
                                variant="ghost"
                                onClick={handleBack}
                                disabled={step === 1 || isSaving}
                                className="gap-1.5 text-muted-foreground hover:text-foreground"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>

                            <Button
                                onClick={handleNext}
                                disabled={isSaving}
                                className="gap-1.5 min-w-[120px]"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        {step === 5 ? 'Ver resumen' : 'Siguiente'}
                                        <ChevronRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
