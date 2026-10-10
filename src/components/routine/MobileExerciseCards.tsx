import { useState, useCallback } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell, ExerciseSet } from '@/types/training';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Lightbulb, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MUSCLE_GROUP_LABELS } from '@/lib/training/muscle-groups';

interface MobileExerciseCardsProps {
  exercises: TrainingExercise[];
  columns: TrainingColumn[];
  cells: TrainingCell[];
  sets: ExerciseSet[];
  weekNumber: number;
  dayName?: string;
  sessionDateLabel?: string;
  onCellChange: (exerciseId: string, columnId: string, value: string) => void;
  onGenerateSets: (exerciseId: string, series: number, weight: number | null, reps: number | null, rir: number | null) => Promise<any>;
  onSetUpdate: (setId: string, payload: { weightKg?: number | null; reps?: number | null; rir?: number | null }) => Promise<void>;
  onRevertSet: (setId: string, baseWeight: number | null, baseReps: number | null, baseRir: number | null) => Promise<void>;
  onAddSet: (exerciseId: string, baseWeight: number | null, baseReps: number | null, baseRir: number | null) => Promise<any>;
  onDeleteSet: (setId: string) => Promise<void>;
}

// Columnas del coach que se muestran como "chips" de prescripción
const PRESCRIPTION_KEYS = ['sets', 'reps', 'rir', 'rest'];
// Columnas del coach con texto libre (indicaciones)
const TEXT_KEYS = ['tips', 'notes'];
const HIDDEN_KEYS = ['exercise', 'c1'];

function formatRest(value: string) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed} s` : trimmed;
}

function formatPrescription(key: string | undefined, value: string) {
  switch (key) {
    case 'sets': return `${value} series`;
    case 'reps': return `${value} reps`;
    case 'rir': return `RIR ${value}`;
    case 'rest': return `Desc. ${formatRest(value)}`;
    default: return value;
  }
}

function formatKg(value: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
}

// Peso para un input: coma decimal, como se escribe en España
function toInputDecimal(value: number | null) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

function parseDecimal(value: string) {
  if (!value.trim()) return null;
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const fieldClass = 'h-10 w-full rounded-lg border border-transparent bg-muted/60 px-2 text-center text-[15px] font-medium tabular-nums text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20';

export function MobileExerciseCards({
  exercises,
  columns,
  cells,
  sets,
  weekNumber,
  dayName,
  sessionDateLabel,
  onCellChange,
  onGenerateSets,
  onSetUpdate,
  onRevertSet,
  onAddSet,
  onDeleteSet,
}: MobileExerciseCardsProps) {
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [addingSet, setAddingSet] = useState<string | null>(null);

  // Base block state per exercise
  const [baseBlocks, setBaseBlocks] = useState<Record<string, { series: number; weight: string; reps: string; rir: string }>>({});

  const getCellValue = useCallback((exerciseId: string, columnId: string): string => {
    const column = columns.find(c => c.id === columnId);
    const weekToCheck = column?.scope === 'exercise' ? 0 : weekNumber;
    const cell = cells.find(c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === weekToCheck);
    if (cell?.value) return cell.value;
    if (column?.scope === 'week' && weekNumber > 1) {
      const prev = cells.find(c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === weekNumber - 1);
      if (prev?.value) return prev.value;
    }
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise && column?.key) {
      switch (column.key) {
        case 'sets': return exercise.sets?.toString() || '';
        case 'reps': return exercise.reps || '';
        case 'rir': return exercise.rir?.toString() || '';
        case 'rest': return exercise.restSeconds?.toString() || '';
        case 'notes': return exercise.notes || '';
      }
    }
    return '';
  }, [cells, columns, weekNumber, exercises]);

  const getColumnId = useCallback((key: string) => columns.find(c => c.key === key)?.id || key, [columns]);
  const coachColumns = columns.filter(c => !c.editable && !HIDDEN_KEYS.includes(c.key ?? ''));
  const prescriptionColumns = PRESCRIPTION_KEYS
    .map(key => coachColumns.find(c => c.key === key))
    .filter(Boolean) as TrainingColumn[];
  const textColumns = coachColumns.filter(c => !PRESCRIPTION_KEYS.includes(c.key ?? ''));
  const notesColumn = columns.find(c => c.key === 'notes' && c.editable);

  const getExerciseSets = useCallback((exerciseId: string): ExerciseSet[] => {
    return sets
      .filter(s => s.exerciseId === exerciseId && s.weekNumber === weekNumber)
      .sort((a, b) => a.setIndex - b.setIndex);
  }, [sets, weekNumber]);

  // Derive base block from existing sets (first non-override) or coach prescription
  const getBaseBlock = useCallback((exerciseId: string) => {
    const override = baseBlocks[exerciseId];
    if (override) return override;

    const exerciseSets = getExerciseSets(exerciseId);
    const firstNonOverride = exerciseSets.find(s => !s.isOverride);

    if (firstNonOverride) {
      return {
        series: exerciseSets.length,
        weight: toInputDecimal(firstNonOverride.weightKg),
        reps: firstNonOverride.reps?.toString() || '',
        rir: firstNonOverride.rir?.toString() || '',
      };
    }

    // Fallback to coach prescription
    return {
      series: parseInt(getCellValue(exerciseId, getColumnId('sets'))) || 4,
      weight: '',
      reps: parseInt(getCellValue(exerciseId, getColumnId('reps'))) ? String(parseInt(getCellValue(exerciseId, getColumnId('reps')))) : '',
      rir: getCellValue(exerciseId, getColumnId('rir')) || '',
    };
  }, [baseBlocks, getExerciseSets, getCellValue, getColumnId]);

  const handleApplyBase = useCallback(async (exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    if (base.series < 1) return;

    setApplying(exerciseId);
    await onGenerateSets(
      exerciseId,
      base.series,
      parseDecimal(base.weight),
      parseInteger(base.reps),
      parseInteger(base.rir)
    );
    setApplying(null);
    setBulkEditOpen(p => ({ ...p, [exerciseId]: false }));
    setBaseBlocks(prev => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }, [getBaseBlock, onGenerateSets]);

  const handleAddSetClick = useCallback(async (exerciseId: string) => {
    const exerciseSets = getExerciseSets(exerciseId);
    const last = exerciseSets[exerciseSets.length - 1];
    const base = getBaseBlock(exerciseId);
    setAddingSet(exerciseId);
    // La nueva serie copia la última registrada (lo habitual al añadir una más)
    await onAddSet(
      exerciseId,
      last ? last.weightKg : parseDecimal(base.weight),
      last ? last.reps : parseInteger(base.reps),
      last ? last.rir : parseInteger(base.rir)
    );
    setAddingSet(null);
  }, [getBaseBlock, getExerciseSets, onAddSet]);

  const handleRevertClick = useCallback(async (setId: string, exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    await onRevertSet(
      setId,
      parseDecimal(base.weight),
      parseInteger(base.reps),
      parseInteger(base.rir)
    );
  }, [getBaseBlock, onRevertSet]);

  const updateBaseField = (exerciseId: string, field: string, value: string) => {
    setBaseBlocks(prev => ({
      ...prev,
      [exerciseId]: { ...getBaseBlock(exerciseId), [field]: field === 'series' ? Number(value) || 0 : value },
    }));
  };

  const isExerciseLogged = (exerciseId: string) =>
    getExerciseSets(exerciseId).some(s => s.weightKg !== null || s.reps !== null);

  const completedCount = exercises.filter(ex => isExerciseLogged(ex.id)).length;
  const plannedSeries = exercises.reduce((total, ex) => total + (parseInt(getCellValue(ex.id, getColumnId('sets'))) || 0), 0);
  const ratio = exercises.length > 0 ? completedCount / exercises.length : 0;

  const renderBaseForm = (exerciseId: string, hasSets: boolean, setCount: number) => {
    const base = getBaseBlock(exerciseId);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {([
            { field: 'series', label: 'Series', value: String(base.series || ''), inputMode: 'numeric' as const },
            { field: 'weight', label: 'Kg', value: base.weight, inputMode: 'decimal' as const },
            { field: 'reps', label: 'Reps', value: base.reps, inputMode: 'numeric' as const },
            { field: 'rir', label: 'RIR', value: base.rir, inputMode: 'numeric' as const },
          ]).map(input => (
            <label key={input.field} className="space-y-1">
              <span className="block text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {input.label}
              </span>
              <input
                type="text"
                inputMode={input.inputMode}
                value={input.value}
                onChange={(e) => updateBaseField(exerciseId, input.field, e.target.value)}
                placeholder="—"
                className={fieldClass}
              />
            </label>
          ))}
        </div>
        <Button
          onClick={() => handleApplyBase(exerciseId)}
          disabled={applying === exerciseId || base.series < 1}
          className="h-10 w-full gap-1.5 rounded-xl"
        >
          {applying === exerciseId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {hasSets ? `Aplicar a las ${setCount} series` : `Crear ${base.series || 0} series`}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-3 px-4">
      {/* Resumen de la sesión */}
      {exercises.length > 0 && (
        <section className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <ProgressRing value={ratio} size={60} stroke={6}>
            <span className="text-xs">{completedCount}/{exercises.length}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            {sessionDateLabel && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sessionDateLabel}</p>
            )}
            <h2 className="truncate text-lg font-semibold leading-tight">{dayName || 'Sesión'}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {exercises.length} ejercicio{exercises.length === 1 ? '' : 's'}
              {plannedSeries > 0 && ` · ${plannedSeries} series`}
              {completedCount === exercises.length ? ' · ¡Sesión completa!' : ''}
            </p>
          </div>
        </section>
      )}

      {exercises.map((exercise, index) => {
        const isExpanded = expandedExercise === exercise.id;
        const exerciseSets = getExerciseSets(exercise.id);
        const hasSets = exerciseSets.length > 0;
        const hasData = isExerciseLogged(exercise.id);
        const muscle = exercise.muscleGroup && exercise.muscleGroup !== 'otros' ? MUSCLE_GROUP_LABELS[exercise.muscleGroup] : null;
        const prescription = prescriptionColumns
          .map(col => ({ col, value: getCellValue(exercise.id, col.id) }))
          .filter(entry => entry.value);
        const coachTexts = textColumns
          .map(col => ({ col, value: getCellValue(exercise.id, col.id) }))
          .filter(entry => entry.value && String(entry.value).trim());
        const loggedSummary = hasData
          ? (() => {
            const weights = exerciseSets.map(s => s.weightKg).filter((v): v is number => v !== null);
            const reps = exerciseSets.map(s => s.reps).filter((v): v is number => v !== null);
            const topWeight = weights.length ? Math.max(...weights) : null;
            const repsLabel = reps.length ? (Math.min(...reps) === Math.max(...reps) ? `${reps[0]}` : `${Math.min(...reps)}-${Math.max(...reps)}`) : '—';
            return `${exerciseSets.length} × ${repsLabel} reps${topWeight !== null ? ` · ${formatKg(topWeight)} kg` : ''}`;
          })()
          : null;

        return (
          <article
            key={exercise.id}
            className={cn(
              'overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors',
              hasData ? 'border-success/30' : 'border-border/70',
              isExpanded && 'ring-1 ring-primary/15'
            )}
          >
            {/* Cabecera */}
            <button
              type="button"
              onClick={() => setExpandedExercise(isExpanded ? null : exercise.id)}
              aria-expanded={isExpanded}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  hasData ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {hasData ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
              </span>

              <div className="min-w-0 flex-1">
                {muscle && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{muscle}</p>
                )}
                <h3 className="text-[15px] font-semibold leading-snug text-foreground">{exercise.name}</h3>

                {prescription.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prescription.map(({ col, value }) => (
                      <span key={col.id} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground/80">
                        {formatPrescription(col.key, String(value))}
                      </span>
                    ))}
                  </div>
                )}

                {loggedSummary && (
                  <p className="mt-2 text-xs font-medium text-success">Registrado: {loggedSummary}</p>
                )}
              </div>

              <ChevronDown
                className={cn('mt-1.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
              />
            </button>

            {isExpanded && (
              <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-4">
                {/* Indicaciones del coach */}
                {coachTexts.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Indicaciones del coach
                    </p>
                    {coachTexts.map(({ col, value }) => (
                      <p key={col.id} className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                        {coachTexts.length > 1 && <span className="font-medium text-muted-foreground">{col.label}: </span>}
                        {String(value)}
                      </p>
                    ))}
                  </div>
                )}

                {!hasSets ? (
                  /* Primer registro: se crean todas las series de golpe */
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Registra tus series</p>
                    <p className="text-xs text-muted-foreground">
                      Rellena lo que has hecho y se crearán todas las series; luego puedes ajustar cada una.
                    </p>
                    {renderBaseForm(exercise.id, false, 0)}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Tabla de series */}
                    <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2.25rem] items-center gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="text-center">Serie</span>
                      <span className="text-center">Kg</span>
                      <span className="text-center">Reps</span>
                      <span className="text-center">RIR</span>
                      <span />
                    </div>

                    {exerciseSets.map((s) => (
                      <div key={s.id} className="grid grid-cols-[2rem_1fr_1fr_1fr_2.25rem] items-center gap-2">
                        {s.isOverride ? (
                          <button
                            type="button"
                            onClick={() => handleRevertClick(s.id, exercise.id)}
                            title="Volver al valor base"
                            aria-label={`Serie ${s.setIndex + 1} editada. Volver al valor base`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
                            {s.setIndex + 1}
                          </span>
                        )}
                        {/* La key incluye el valor: al aplicar el bloque base las series
                            mantienen su id y el input no controlado se quedaba con el valor viejo */}
                        <input
                          key={`w-${s.id}-${s.weightKg}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={toInputDecimal(s.weightKg)}
                          placeholder="—"
                          aria-label={`Peso serie ${s.setIndex + 1}`}
                          className={fieldClass}
                          onBlur={(e) => {
                            const v = parseDecimal(e.target.value);
                            if (v !== s.weightKg) onSetUpdate(s.id, { weightKg: v });
                          }}
                        />
                        <input
                          key={`r-${s.id}-${s.reps}`}
                          type="text"
                          inputMode="numeric"
                          defaultValue={s.reps ?? ''}
                          placeholder="—"
                          aria-label={`Repeticiones serie ${s.setIndex + 1}`}
                          className={fieldClass}
                          onBlur={(e) => {
                            const v = parseInteger(e.target.value);
                            if (v !== s.reps) onSetUpdate(s.id, { reps: v });
                          }}
                        />
                        <input
                          key={`i-${s.id}-${s.rir}`}
                          type="text"
                          inputMode="numeric"
                          defaultValue={s.rir ?? ''}
                          placeholder="—"
                          aria-label={`RIR serie ${s.setIndex + 1}`}
                          className={fieldClass}
                          onBlur={(e) => {
                            const v = parseInteger(e.target.value);
                            if (v !== s.rir) onSetUpdate(s.id, { rir: v });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => onDeleteSet(s.id)}
                          aria-label={`Eliminar serie ${s.setIndex + 1}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSetClick(exercise.id)}
                        disabled={addingSet === exercise.id}
                        className="h-9 gap-1.5 rounded-xl"
                      >
                        {addingSet === exercise.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Añadir serie
                      </Button>
                      <Button
                        variant={bulkEditOpen[exercise.id] ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setBulkEditOpen(p => ({ ...p, [exercise.id]: !p[exercise.id] }))}
                        className="h-9 gap-1.5 rounded-xl"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Editar todas
                      </Button>
                    </div>

                    {bulkEditOpen[exercise.id] && (
                      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                        {renderBaseForm(exercise.id, true, exerciseSets.length)}
                      </div>
                    )}
                  </div>
                )}

                {/* Notas del atleta */}
                {notesColumn && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{notesColumn.label}</span>
                    <textarea
                      defaultValue={getCellValue(exercise.id, notesColumn.id)}
                      placeholder="¿Cómo te ha ido? Sensaciones, molestias…"
                      className="min-h-[64px] w-full rounded-xl border border-transparent bg-muted/60 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onBlur={(e) => {
                        if (e.target.value !== getCellValue(exercise.id, notesColumn.id)) {
                          onCellChange(exercise.id, notesColumn.id, e.target.value);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
