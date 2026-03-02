import { useState, useCallback, useMemo } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell, ExerciseSet } from '@/types/training';
import { cn } from '@/lib/utils';
import { Lock, Check, Loader2, ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MobileExerciseCardsProps {
  exercises: TrainingExercise[];
  columns: TrainingColumn[];
  cells: TrainingCell[];
  sets: ExerciseSet[];
  weekNumber: number;
  onCellChange: (exerciseId: string, columnId: string, value: string) => void;
  onGenerateSets: (exerciseId: string, series: number, weight: number | null, reps: number | null, rir: number | null) => Promise<any>;
  onSetUpdate: (setId: string, payload: { weightKg?: number | null; reps?: number | null; rir?: number | null }) => Promise<void>;
  onRevertSet: (setId: string, baseWeight: number | null, baseReps: number | null, baseRir: number | null) => Promise<void>;
  onAddSet: (exerciseId: string, baseWeight: number | null, baseReps: number | null, baseRir: number | null) => Promise<any>;
  onDeleteSet: (setId: string) => Promise<void>;
}

export function MobileExerciseCards({
  exercises,
  columns,
  cells,
  sets,
  weekNumber,
  onCellChange,
  onGenerateSets,
  onSetUpdate,
  onRevertSet,
  onAddSet,
  onDeleteSet,
}: MobileExerciseCardsProps) {
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [showSets, setShowSets] = useState<Record<string, boolean>>({});
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

  const getColumnId = (key: string) => columns.find(c => c.key === key)?.id || key;
  const coachColumns = columns.filter(c => !c.editable && c.key !== 'exercise');
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
        weight: firstNonOverride.weightKg?.toString() || '',
        reps: firstNonOverride.reps?.toString() || '',
        rir: firstNonOverride.rir?.toString() || '',
      };
    }

    // Fallback to coach prescription
    return {
      series: parseInt(getCellValue(exerciseId, getColumnId('sets'))) || 4,
      weight: '',
      reps: getCellValue(exerciseId, getColumnId('reps')) || '',
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
      base.weight ? parseFloat(base.weight) : null,
      base.reps ? parseInt(base.reps) : null,
      base.rir ? parseInt(base.rir) : null
    );
    setApplying(null);
    setShowSets(p => ({ ...p, [exerciseId]: true }));
  }, [getBaseBlock, onGenerateSets]);

  const handleAddSetClick = useCallback(async (exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    setAddingSet(exerciseId);
    await onAddSet(
      exerciseId,
      base.weight ? parseFloat(base.weight) : null,
      base.reps ? parseInt(base.reps) : null,
      base.rir ? parseInt(base.rir) : null
    );
    setAddingSet(null);
  }, [getBaseBlock, onAddSet]);

  const handleRevertClick = useCallback(async (setId: string, exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    await onRevertSet(
      setId,
      base.weight ? parseFloat(base.weight) : null,
      base.reps ? parseInt(base.reps) : null,
      base.rir ? parseInt(base.rir) : null
    );
  }, [getBaseBlock, onRevertSet]);

  const updateBaseField = (exerciseId: string, field: string, value: string) => {
    setBaseBlocks(prev => ({
      ...prev,
      [exerciseId]: { ...getBaseBlock(exerciseId), [field]: value },
    }));
  };

  const completedCount = exercises.filter(ex => {
    const exerciseSets = getExerciseSets(ex.id);
    return exerciseSets.some(s => s.weightKg !== null || s.reps !== null);
  }).length;

  return (
    <div className="space-y-3 px-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="progress-bar flex-1">
          <div className="progress-bar-fill" style={{ width: `${exercises.length > 0 ? (completedCount / exercises.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{completedCount} / {exercises.length}</span>
      </div>

      {exercises.map((exercise) => {
        const isExpanded = expandedExercise === exercise.id;
        const exerciseSets = getExerciseSets(exercise.id);
        const hasSets = exerciseSets.length > 0;
        const hasData = exerciseSets.some(s => s.weightKg !== null || s.reps !== null);
        const setsVisible = showSets[exercise.id] ?? false;
        const base = getBaseBlock(exercise.id);
        const overrideCount = exerciseSets.filter(s => s.isOverride).length;

        // Summary text
        const summaryText = hasSets
          ? `${exerciseSets.length} × ${base.weight || '—'}kg × ${base.reps || '—'}${overrideCount > 0 ? ` (${overrideCount} editada${overrideCount > 1 ? 's' : ''})` : ''}`
          : `${base.series} series planificadas`;

        return (
          <Card key={exercise.id} className={cn('overflow-hidden transition-all', hasData && 'border-primary/30')}>
            {/* Header */}
            <button
              onClick={() => setExpandedExercise(isExpanded ? null : exercise.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{summaryText}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasData && <Check className="h-4 w-4 text-success" />}
                {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border">
                {/* Coach info */}
                <div className="p-4 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase">
                    <Lock className="h-3 w-3" />
                    Info del entrenador
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {coachColumns.map((col) => {
                      const value = getCellValue(exercise.id, col.id);
                      if (!value) return null;
                      return (
                        <div key={col.id}>
                          <span className="text-xs text-muted-foreground">{col.label}</span>
                          <p className="text-sm font-medium">{value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Base Block Form ── */}
                <div className="p-4 space-y-3">
                  <div className="text-xs font-medium text-primary uppercase">Bloque base</div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Series</label>
                      <Input
                        type="number"
                        min={1}
                        value={base.series}
                        onChange={(e) => updateBaseField(exercise.id, 'series', e.target.value)}
                        className="h-9 text-center text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Peso (kg)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={base.weight}
                        onChange={(e) => updateBaseField(exercise.id, 'weight', e.target.value)}
                        placeholder="—"
                        className="h-9 text-center text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Reps</label>
                      <Input
                        type="number"
                        min={0}
                        value={base.reps}
                        onChange={(e) => updateBaseField(exercise.id, 'reps', e.target.value)}
                        placeholder="—"
                        className="h-9 text-center text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">RIR</label>
                      <Input
                        type="number"
                        min={0}
                        value={base.rir}
                        onChange={(e) => updateBaseField(exercise.id, 'rir', e.target.value)}
                        placeholder="—"
                        className="h-9 text-center text-sm"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => handleApplyBase(exercise.id)}
                    disabled={applying === exercise.id || base.series < 1}
                    className="w-full gap-1.5"
                    size="sm"
                  >
                    {applying === exercise.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {hasSets ? 'Aplicar a series' : 'Generar series'}
                  </Button>
                </div>

                {/* ── Sets List (expandable) ── */}
                {hasSets && (
                  <div className="border-t border-border">
                    <button
                      onClick={() => setShowSets(p => ({ ...p, [exercise.id]: !setsVisible }))}
                      className="w-full flex items-center justify-between p-3 px-4 text-sm font-medium text-muted-foreground hover:bg-muted/30"
                    >
                      <span>Ver series ({exerciseSets.length})</span>
                      {setsVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {setsVisible && (
                      <div className="px-4 pb-4 space-y-2">
                        {/* Header */}
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 text-[10px] text-muted-foreground font-medium px-1">
                          <span className="w-5">#</span>
                          <span>Peso</span>
                          <span>Reps</span>
                          <span>RIR</span>
                          <span className="w-14"></span>
                        </div>

                        {exerciseSets.map((s) => (
                          <div
                            key={s.id}
                            className={cn(
                              'grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center',
                              s.isOverride && 'bg-amber-500/5 rounded-lg p-1 -mx-1'
                            )}
                          >
                            <span className={cn('w-5 text-xs font-medium text-center', s.isOverride ? 'text-amber-600' : 'text-muted-foreground')}>
                              {s.setIndex + 1}
                            </span>
                            <input
                              type="number"
                              defaultValue={s.weightKg ?? ''}
                              placeholder="—"
                              className="w-full cell-client rounded-lg text-sm text-center"
                              onBlur={(e) => {
                                const v = e.target.value ? parseFloat(e.target.value) : null;
                                if (v !== s.weightKg) onSetUpdate(s.id, { weightKg: v });
                              }}
                            />
                            <input
                              type="number"
                              defaultValue={s.reps ?? ''}
                              placeholder="—"
                              className="w-full cell-client rounded-lg text-sm text-center"
                              onBlur={(e) => {
                                const v = e.target.value ? parseInt(e.target.value) : null;
                                if (v !== s.reps) onSetUpdate(s.id, { reps: v });
                              }}
                            />
                            <input
                              type="number"
                              defaultValue={s.rir ?? ''}
                              placeholder="—"
                              className="w-full cell-client rounded-lg text-sm text-center"
                              onBlur={(e) => {
                                const v = e.target.value ? parseInt(e.target.value) : null;
                                if (v !== s.rir) onSetUpdate(s.id, { rir: v });
                              }}
                            />
                            <div className="flex items-center gap-0.5 w-14 justify-end">
                              {s.isOverride && (
                                <button
                                  onClick={() => handleRevertClick(s.id, exercise.id)}
                                  className="p-1 rounded hover:bg-muted"
                                  title="Revertir al bloque base"
                                >
                                  <RotateCcw className="h-3 w-3 text-amber-600" />
                                </button>
                              )}
                              <button
                                onClick={() => onDeleteSet(s.id)}
                                className="p-1 rounded hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Add set */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddSetClick(exercise.id)}
                          disabled={addingSet === exercise.id}
                          className="w-full gap-1 text-xs h-8"
                        >
                          {addingSet === exercise.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Añadir serie igual
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {notesColumn && (
                  <div className="p-4 pt-0 space-y-1">
                    <label className="text-xs text-muted-foreground">{notesColumn.label}</label>
                    <textarea
                      defaultValue={getCellValue(exercise.id, notesColumn.id)}
                      placeholder="Notas..."
                      className="w-full cell-client rounded-lg text-sm min-h-[40px]"
                      onBlur={(e) => {
                        if (e.target.value !== getCellValue(exercise.id, notesColumn.id)) {
                          onCellChange(exercise.id, notesColumn.id, e.target.value);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
