import { useState, useCallback } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell, ExerciseSet } from '@/types/training';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Info, Lightbulb, Loader2, Plus, Repeat, RotateCcw, SlidersHorizontal, Timer, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { MUSCLE_GROUP_LABELS } from '@/lib/training/muscle-groups';
import { buildExerciseBlocks, interleaveRounds } from '@/lib/training/supersets';

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
  // Bloques del día: A, B, C1-C2 (superserie)… La letra se calcula, no se guarda.
  const blocks = buildExerciseBlocks(exercises);
  const supersetCount = blocks.filter(block => block.isSuperset).length;
  const plannedSetsOf = (exerciseId: string) => parseInt(getCellValue(exerciseId, getColumnId('sets'))) || 0;
  const restSecondsOf = (exerciseId: string): number | null => {
    const raw = String(getCellValue(exerciseId, getColumnId('rest')) ?? '').trim();
    if (!raw) return null;
    return /^\d+$/.test(raw) ? Number(raw) : null;
  };
  const restTextOf = (exerciseId: string) => {
    const raw = String(getCellValue(exerciseId, getColumnId('rest')) ?? '').trim();
    return raw ? formatRest(raw) : null;
  };

  /** Primer registro de la superserie: crea las series de todos sus ejercicios de una vez. */
  const handleCreateRounds = async (blockId: string, memberIds: string[]) => {
    setApplying(blockId);
    try {
      for (const exerciseId of memberIds) {
        const base = getBaseBlock(exerciseId);
        if (base.series < 1) continue;
        await onGenerateSets(exerciseId, base.series, parseDecimal(base.weight), parseInteger(base.reps), parseInteger(base.rir));
      }
    } finally {
      setApplying(null);
    }
    setBulkEditOpen(p => ({ ...p, [blockId]: false }));
    setBaseBlocks(prev => {
      const next = { ...prev };
      memberIds.forEach(id => { delete next[id]; });
      return next;
    });
  };

  /** Añadir ronda: una serie más en cada ejercicio, copiando su última. */
  const handleAddRound = async (blockId: string, memberIds: string[]) => {
    setAddingSet(blockId);
    try {
      for (const exerciseId of memberIds) {
        const exerciseSets = getExerciseSets(exerciseId);
        const last = exerciseSets[exerciseSets.length - 1];
        const base = getBaseBlock(exerciseId);
        await onAddSet(
          exerciseId,
          last ? last.weightKg : parseDecimal(base.weight),
          last ? last.reps : parseInteger(base.reps),
          last ? last.rir : parseInteger(base.rir)
        );
      }
    } finally {
      setAddingSet(null);
    }
  };

  const renderBaseInputs = (exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    return (
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
    );
  };

  const renderBaseForm = (exerciseId: string, hasSets: boolean, setCount: number) => {
    const base = getBaseBlock(exerciseId);
    return (
      <div className="space-y-3">
        {renderBaseInputs(exerciseId)}
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
        // Panel de tinta en los dos temas, como el del Plan: `dark` da los colores oscuros por dentro.
        <section className="dark nt-stage nt-rise flex items-center gap-4 rounded-[24px] p-5 text-foreground">
          <ProgressRing value={ratio} size={64} stroke={6} className="[&_circle:first-child]:stroke-white/10">
            <span className="nt-number text-[14px] text-white">{completedCount}/{exercises.length}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            {sessionDateLabel && (
              <p className="nt-eyebrow text-white/50">{sessionDateLabel}</p>
            )}
            <h2 className="nt-title mt-1 truncate text-[19px] leading-tight text-white">{dayName || 'Sesión'}</h2>
            <p className="mt-1 text-[13px] text-white/55">
              {exercises.length} ejercicio{exercises.length === 1 ? '' : 's'}
              {supersetCount > 0 && ` · ${supersetCount} ${supersetCount === 1 ? 'superserie' : 'superseries'}`}
              {plannedSeries > 0 && ` · ${plannedSeries} series`}
              {completedCount === exercises.length ? ' · ¡Sesión completa!' : ''}
            </p>
          </div>
        </section>
      )}

      {blocks.map(block => block.isSuperset
        ? renderSupersetCard(block)
        : renderExerciseCard(block.members[0].exercise, block.letter))}
    </div>
  );

  function renderExerciseCard(exercise: TrainingExercise, label: string) {
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
                {hasData ? <Check className="h-4 w-4" strokeWidth={3} /> : label}
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
  }

  function renderSetRow(s: ExerciseSet, exerciseId: string, label: string) {
    return (
      <div key={s.id} className="grid grid-cols-[2.25rem_1fr_1fr_1fr_2.25rem] items-center gap-2">
        {s.isOverride ? (
          <button
            type="button"
            onClick={() => handleRevertClick(s.id, exerciseId)}
            title="Volver al valor base"
            aria-label={`${label}, serie ${s.setIndex + 1} editada. Volver al valor base`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-[12px] font-bold tabular-nums text-primary">
            {label}
          </span>
        )}
        <input
          key={`w-${s.id}-${s.weightKg}`}
          type="text"
          inputMode="decimal"
          defaultValue={toInputDecimal(s.weightKg)}
          placeholder="—"
          aria-label={`Peso de ${label}, serie ${s.setIndex + 1}`}
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
          aria-label={`Repeticiones de ${label}, serie ${s.setIndex + 1}`}
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
          aria-label={`RIR de ${label}, serie ${s.setIndex + 1}`}
          className={fieldClass}
          onBlur={(e) => {
            const v = parseInteger(e.target.value);
            if (v !== s.rir) onSetUpdate(s.id, { rir: v });
          }}
        />
        <button
          type="button"
          onClick={() => onDeleteSet(s.id)}
          aria-label={`Eliminar serie ${s.setIndex + 1} de ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  /** Superserie: una tarjeta con sus ejercicios, el orden en que se hacen y las series por rondas. */
  function renderSupersetCard(block: ReturnType<typeof buildExerciseBlocks<TrainingExercise>>[number]) {
    const blockId = `superset-${block.key}`;
    const isExpanded = expandedExercise === blockId;
    const members = block.members.map(member => {
      const exerciseSets = getExerciseSets(member.exercise.id);
      const hasData = isExerciseLogged(member.exercise.id);
      const prescription = prescriptionColumns
        .filter(col => col.key !== 'rest')
        .map(col => ({ col, value: getCellValue(member.exercise.id, col.id) }))
        .filter(entry => entry.value);
      const coachTexts = textColumns
        .map(col => ({ col, value: getCellValue(member.exercise.id, col.id) }))
        .filter(entry => entry.value && String(entry.value).trim());
      const weights = exerciseSets.map(s => s.weightKg).filter((v): v is number => v !== null);
      const reps = exerciseSets.map(s => s.reps).filter((v): v is number => v !== null);
      const topWeight = weights.length ? Math.max(...weights) : null;
      const repsLabel = reps.length ? (Math.min(...reps) === Math.max(...reps) ? `${reps[0]}` : `${Math.min(...reps)}-${Math.max(...reps)}`) : '—';
      const loggedSummary = hasData
        ? `${exerciseSets.length} × ${repsLabel} reps${topWeight !== null ? ` · ${formatKg(topWeight)} kg` : ''}`
        : null;
      return { ...member, exerciseSets, hasData, prescription, coachTexts, loggedSummary, planned: plannedSetsOf(member.exercise.id) };
    });
    const memberIds = members.map(member => member.exercise.id);
    const allLogged = members.every(member => member.hasData);
    const withSets = members.filter(member => member.exerciseSets.length > 0);
    const pending = members.filter(member => member.exerciseSets.length === 0);
    const plannedRounds = Math.max(0, ...members.map(member => member.planned));
    const loggedRounds = Math.max(0, ...members.map(member => member.exerciseSets.length));
    const rounds = loggedRounds > 0 ? loggedRounds : plannedRounds;
    const last = members[members.length - 1];
    const roundRestText = restTextOf(last.exercise.id);
    const transitions = members.slice(0, -1).map(member => restSecondsOf(member.exercise.id));
    const noTransitionRest = transitions.every(value => value === null || value === 0);
    const transitionText = noTransitionRest
      ? (members.length === 2 ? 'Sin descanso entre ellos' : 'Sin descanso entre ejercicios')
      : members.slice(0, -1).map((member, index) => {
          const seconds = transitions[index];
          return `${member.label} → ${members[index + 1].label}: ${seconds ? `${seconds} s` : 'sin descanso'}`;
        }).join(' · ');
    const restSummary = [transitionText, roundRestText ? `${roundRestText} tras la ronda` : null].filter(Boolean).join(' · ');
    const kindLabel = block.kind === 'triserie' ? 'Triserie' : block.kind === 'serie gigante' ? 'Serie gigante' : 'Superserie';
    const allTips = members.flatMap(member => member.coachTexts.map(({ col, value }) => ({ key: `${member.exercise.id}-${col.id}`, label: member.label, value })));
    const plannedPerMember = members.map(member => (getBaseBlock(member.exercise.id).series || 0));
    const maxPlanned = Math.max(0, ...plannedPerMember);
    const shortMembers = members.filter((_, index) => plannedPerMember[index] < maxPlanned);
    const formRounds = maxPlanned;
    const rowsByRound = interleaveRounds(withSets.map(member => ({ label: member.label, sets: member.exerciseSets })));
    const bulkOpen = Boolean(bulkEditOpen[blockId]);

    return (
      <article
        key={blockId}
        className={cn(
          'overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors',
          allLogged ? 'border-success/30' : 'border-border/70',
          isExpanded && 'ring-1 ring-primary/15'
        )}
      >
        <button
          type="button"
          onClick={() => setExpandedExercise(isExpanded ? null : blockId)}
          aria-expanded={isExpanded}
          className="block w-full text-left"
        >
          <span className="flex items-center justify-between gap-3 px-4 pt-3.5">
            <span className="nt-eyebrow text-primary">{block.letter} · {kindLabel}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" />
              {rounds} {rounds === 1 ? 'ronda' : 'rondas'}
            </span>
          </span>
          <span className="block px-4 pb-1 pt-3">
            {members.map((member, index) => (
              <span key={member.exercise.id} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-3.5">
                {index < members.length - 1 && (
                  <span aria-hidden className="absolute bottom-0.5 left-[15px] top-[2.15rem] w-0.5 rounded-full bg-primary/35" />
                )}
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-bold tabular-nums',
                    member.hasData ? 'bg-success text-success-foreground' : 'bg-primary/15 text-primary'
                  )}
                >
                  {member.label}
                </span>
                <span className="block min-w-0">
                  <span className="block text-[15px] font-semibold leading-snug text-foreground">{member.exercise.name}</span>
                  {member.loggedSummary ? (
                    <span className="mt-1 block text-xs font-medium text-success">Registrado: {member.loggedSummary}</span>
                  ) : member.prescription.length > 0 && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {member.prescription.map(({ col, value }) => (
                        <span key={col.id} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground/80">
                          {formatPrescription(col.key, String(value))}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            ))}
          </span>
          <span className="mx-4 mb-4 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-[13px] text-foreground/85">
            <Timer className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">{restSummary}</span>
            <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
          </span>
        </button>

        {isExpanded && (
          <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-4">
            {/* Cómo se hace */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Cómo se hace</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                {members.map((member, index) => (
                  <span key={member.exercise.id} className="contents">
                    <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-primary">{member.label}</span>
                    {index < members.length - 1 && (
                      <span className="font-normal text-muted-foreground">
                        → {transitions[index] ? `${transitions[index]} s` : 'sin descanso'} →
                      </span>
                    )}
                  </span>
                ))}
                {roundRestText && <span className="rounded-lg bg-muted px-2 py-0.5 text-foreground">{roundRestText}</span>}
                <span className="font-normal text-muted-foreground">→ repite</span>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Una serie de cada uno, seguidas{roundRestText ? '. Descansa al acabar la ronda.' : '.'}
              </p>
            </div>

            {allTips.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Indicaciones del coach
                </p>
                {allTips.map(tip => (
                  <p key={tip.key} className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                    <span className="font-medium text-muted-foreground">{tip.label}: </span>
                    {String(tip.value)}
                  </p>
                ))}
              </div>
            )}

            {withSets.length === 0 ? (
              /* Primer registro: todas las rondas de golpe */
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Registra la superserie</p>
                  <p className="text-xs text-muted-foreground">
                    Pon lo que vas a hacer en cada ejercicio y se crean las rondas. Luego ajustas cada serie.
                  </p>
                </div>
                {members.map(member => (
                  <div key={member.exercise.id} className="space-y-1.5">
                    <p className="flex items-center gap-2 text-[13px] font-semibold">
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-bold text-primary">{member.label}</span>
                      <span className="min-w-0 truncate">{member.exercise.name}</span>
                    </p>
                    {renderBaseInputs(member.exercise.id)}
                  </div>
                ))}
                {shortMembers.length > 0 && maxPlanned > 0 && (
                  <p className="flex gap-2 text-[12.5px] leading-snug text-amber-600 dark:text-amber-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {shortMembers.map(member => member.label).join(' y ')} {shortMembers.length === 1 ? 'tiene' : 'tienen'} menos series: en las últimas rondas solo se hace lo que quede.
                  </p>
                )}
                <Button
                  onClick={() => handleCreateRounds(blockId, memberIds)}
                  disabled={applying === blockId || formRounds < 1}
                  className="h-10 w-full gap-1.5 rounded-xl"
                >
                  {applying === blockId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Crear {formRounds} {formRounds === 1 ? 'ronda' : 'rondas'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[2.25rem_1fr_1fr_1fr_2.25rem] items-center gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="text-center">Serie</span>
                  <span className="text-center">Kg</span>
                  <span className="text-center">Reps</span>
                  <span className="text-center">RIR</span>
                  <span />
                </div>

                {rowsByRound.map((round, roundIndex) => {
                  const missing = withSets.filter(member => !round.entries.some(entry => entry.label === member.label));
                  return (
                    <div key={round.index} className="space-y-2">
                      <p className="nt-eyebrow flex items-center gap-2.5 text-muted-foreground after:h-px after:flex-1 after:bg-border/70 after:content-['']">
                        Ronda {round.index + 1}
                      </p>
                      {round.entries.map(entry => {
                        const member = withSets[entry.memberIndex];
                        return renderSetRow(entry.set, member.exercise.id, member.label);
                      })}
                      {missing.length > 0 && (
                        <p className="pl-11 text-[12.5px] text-muted-foreground">
                          {missing.map(member => `${member.label} ya ha hecho sus ${member.exerciseSets.length} series`).join(' · ')}.
                        </p>
                      )}
                      {roundIndex < rowsByRound.length - 1 && roundRestText && (
                        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-primary before:h-0 before:flex-1 before:border-t before:border-dashed before:border-primary/40 before:content-[''] after:h-0 after:flex-1 after:border-t after:border-dashed after:border-primary/40 after:content-['']">
                          Descansa {roundRestText}
                        </p>
                      )}
                    </div>
                  );
                })}

                {pending.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                    {pending.map(member => (
                      <div key={member.exercise.id} className="space-y-1.5">
                        <p className="text-[13px] font-semibold">Registra {member.label} · {member.exercise.name}</p>
                        {renderBaseForm(member.exercise.id, false, 0)}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddRound(blockId, withSets.map(member => member.exercise.id))}
                    disabled={addingSet === blockId}
                    className="h-9 gap-1.5 rounded-xl"
                  >
                    {addingSet === blockId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Añadir ronda
                  </Button>
                  <Button
                    variant={bulkOpen ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setBulkEditOpen(p => ({ ...p, [blockId]: !p[blockId] }))}
                    className="h-9 gap-1.5 rounded-xl"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Editar todas
                  </Button>
                </div>

                {bulkOpen && (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
                    {withSets.map(member => (
                      <div key={member.exercise.id} className="space-y-1.5">
                        <p className="flex items-center gap-2 text-[13px] font-semibold">
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-bold text-primary">{member.label}</span>
                          <span className="min-w-0 truncate">{member.exercise.name}</span>
                        </p>
                        {renderBaseForm(member.exercise.id, true, member.exerciseSets.length)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notas del atleta, una por ejercicio */}
            {notesColumn && members.map(member => (
              <label key={member.exercise.id} className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">{notesColumn.label} · {member.label}</span>
                <textarea
                  defaultValue={getCellValue(member.exercise.id, notesColumn.id)}
                  placeholder="¿Cómo te ha ido? Sensaciones, molestias…"
                  className="min-h-[56px] w-full rounded-xl border border-transparent bg-muted/60 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onBlur={(e) => {
                    if (e.target.value !== getCellValue(member.exercise.id, notesColumn.id)) {
                      onCellChange(member.exercise.id, notesColumn.id, e.target.value);
                    }
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </article>
    );
  }
}
