import { useState, useCallback } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell, CellSaveStatus, ExerciseSet } from '@/types/training';
import { cn } from '@/lib/utils';
import { Lock, Check, Loader2, AlertCircle, Plus, Trash2, RotateCcw, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ExerciseTableProps {
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

export function ExerciseTable({
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
}: ExerciseTableProps) {
  const [saveStatus, setSaveStatus] = useState<Record<string, CellSaveStatus>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [addingSet, setAddingSet] = useState<string | null>(null);
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

  const handleCellChange = useCallback((exerciseId: string, columnId: string, value: string) => {
    const cellKey = `${exerciseId}-${columnId}`;
    setSaveStatus(prev => ({ ...prev, [cellKey]: { status: 'saving' } }));
    setTimeout(() => {
      onCellChange(exerciseId, columnId, value);
      setSaveStatus(prev => ({ ...prev, [cellKey]: { status: 'saved', lastSaved: new Date() } }));
      setTimeout(() => { setSaveStatus(prev => ({ ...prev, [cellKey]: { status: 'idle' } })); }, 2000);
    }, 500);
  }, [onCellChange]);

  const getExerciseSets = useCallback((exerciseId: string): ExerciseSet[] => {
    return sets.filter(s => s.exerciseId === exerciseId && s.weekNumber === weekNumber).sort((a, b) => a.setIndex - b.setIndex);
  }, [sets, weekNumber]);

  const getBaseBlock = useCallback((exerciseId: string) => {
    if (baseBlocks[exerciseId]) return baseBlocks[exerciseId];
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
      exerciseId, base.series,
      base.weight ? parseFloat(base.weight) : null,
      base.reps ? parseInt(base.reps) : null,
      base.rir ? parseInt(base.rir) : null
    );
    setApplying(null);
    setExpandedRow(exerciseId);
  }, [getBaseBlock, onGenerateSets]);

  const handleAddSetClick = useCallback(async (exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    setAddingSet(exerciseId);
    await onAddSet(exerciseId, base.weight ? parseFloat(base.weight) : null, base.reps ? parseInt(base.reps) : null, base.rir ? parseInt(base.rir) : null);
    setAddingSet(null);
  }, [getBaseBlock, onAddSet]);

  const handleRevertClick = useCallback(async (setId: string, exerciseId: string) => {
    const base = getBaseBlock(exerciseId);
    await onRevertSet(setId, base.weight ? parseFloat(base.weight) : null, base.reps ? parseInt(base.reps) : null, base.rir ? parseInt(base.rir) : null);
  }, [getBaseBlock, onRevertSet]);

  const updateBaseField = (exerciseId: string, field: string, value: string) => {
    setBaseBlocks(prev => ({ ...prev, [exerciseId]: { ...getBaseBlock(exerciseId), [field]: value } }));
  };

  const renderSaveIndicator = (exerciseId: string, columnId: string) => {
    const status = saveStatus[`${exerciseId}-${columnId}`]?.status || 'idle';
    if (status === 'idle') return null;
    return (
      <span className={cn('save-indicator ml-1', status === 'saved' && 'save-indicator-saved', status === 'saving' && 'save-indicator-saving', status === 'error' && 'save-indicator-error')}>
        {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === 'saved' && <Check className="h-3 w-3" />}
        {status === 'error' && <AlertCircle className="h-3 w-3" />}
      </span>
    );
  };

  const isSetColumn = (col: TrainingColumn) => ['weight', 'reps_done', 'notes'].includes(col.key || '');
  const isNotesColumn = (col: TrainingColumn) => col.key === 'notes';
  const tableColumns = columns.filter(c => !isSetColumn(c) && !isNotesColumn(c));
  const notesCol = columns.find(c => isNotesColumn(c));

  const completedCount = exercises.filter(ex => getExerciseSets(ex.id).some(s => s.weightKg !== null || s.reps !== null)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-4">
        <div className="progress-bar flex-1">
          <div className="progress-bar-fill" style={{ width: `${exercises.length > 0 ? (completedCount / exercises.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{completedCount} / {exercises.length} ejercicios</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {tableColumns.map((col, i) => (
                <th key={col.id} className={cn('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground', i === 0 && 'sticky-col bg-muted/50')}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    {!col.editable && col.id !== 'c1' && (
                      <Tooltip><TooltipTrigger><Lock className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger><TooltipContent><p>Definido por tu entrenador</p></TooltipContent></Tooltip>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-primary min-w-[520px]">
                Bloque base / Series
              </th>
              {notesCol && (
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground min-w-[160px] max-w-[420px]">
                  {notesCol.label}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {exercises.map((exercise, rowIndex) => {
              const exerciseSets = getExerciseSets(exercise.id);
              const isExpanded = expandedRow === exercise.id;
              const base = getBaseBlock(exercise.id);
              const hasSets = exerciseSets.length > 0;
              const overrideCount = exerciseSets.filter(s => s.isOverride).length;

              return (
                <tr key={exercise.id} className={cn('border-b border-border transition-colors', rowIndex % 2 === 0 ? 'bg-card' : 'bg-card/50')}>
                  {tableColumns.map((col, colIndex) => {
                    const value = col.id === 'c1' ? exercise.name : getCellValue(exercise.id, col.id);
                    const cellKey = `${exercise.id}-${col.id}`;
                    return (
                      <td key={col.id} className={cn(colIndex === 0 && 'sticky-col font-medium', !col.editable ? 'cell-coach' : 'p-1')}>
                        {col.editable ? (
                          <div className="cell-client">
                            {col.type === 'textarea' ? (
                              <textarea key={`${col.id}-${weekNumber}`} defaultValue={value} placeholder="..." className="w-full min-w-[100px] resize-none bg-transparent text-sm outline-none" rows={1} onFocus={() => setEditingCell(cellKey)} onBlur={(e) => { setEditingCell(null); if (e.target.value !== getCellValue(exercise.id, col.id)) handleCellChange(exercise.id, col.id, e.target.value); }} />
                            ) : (
                              <input key={`${col.id}-${weekNumber}`} type={col.type} defaultValue={value} placeholder="..." className="w-full min-w-[60px] bg-transparent text-sm outline-none" onFocus={() => setEditingCell(cellKey)} onBlur={(e) => { setEditingCell(null); if (e.target.value !== getCellValue(exercise.id, col.id)) handleCellChange(exercise.id, col.id, e.target.value); }} />
                            )}
                            {renderSaveIndicator(exercise.id, col.id)}
                          </div>
                        ) : (
                          <span className="text-sm">{value}</span>
                        )}
                      </td>
                    );
                  })}

                  {/* Base block + Sets column */}
                  <td className="p-2 align-top">
                    <div className="space-y-2">
                      {/* Inline base block inputs */}
                      <div className="grid grid-cols-[minmax(80px,90px)_minmax(110px,1fr)_minmax(90px,1fr)_minmax(80px,1fr)_auto] gap-3 items-end">
                        <div>
                          <span className="text-[10px] text-muted-foreground">Series</span>
                          <Input type="number" min={1} value={base.series} onChange={(e) => updateBaseField(exercise.id, 'series', e.target.value)} className="h-9 text-center text-sm px-3" />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Peso (kg)</span>
                          <Input type="number" min={0} step={0.5} value={base.weight} onChange={(e) => updateBaseField(exercise.id, 'weight', e.target.value)} placeholder="kg" className="h-9 text-center text-sm px-3" />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Reps</span>
                          <Input type="number" min={0} value={base.reps} onChange={(e) => updateBaseField(exercise.id, 'reps', e.target.value)} placeholder="—" className="h-9 text-center text-sm px-3" />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">RIR</span>
                          <Input type="number" min={0} value={base.rir} onChange={(e) => updateBaseField(exercise.id, 'rir', e.target.value)} placeholder="—" className="h-9 text-center text-sm px-3" />
                        </div>
                        <Button size="sm" variant="default" onClick={() => handleApplyBase(exercise.id)} disabled={applying === exercise.id || base.series < 1} className="h-9 text-sm gap-1.5 px-3">
                          {applying === exercise.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                          {hasSets ? 'Aplicar' : 'Generar'}
                        </Button>
                      </div>

                      {/* Expandable sets */}
                      {hasSets && (
                        <>
                          <button onClick={() => setExpandedRow(isExpanded ? null : exercise.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {exerciseSets.length} series{overrideCount > 0 && <span className="text-amber-600">({overrideCount} editada{overrideCount > 1 ? 's' : ''})</span>}
                          </button>

                          {isExpanded && (
                            <div className="space-y-1.5 pt-1">
                              {exerciseSets.map((s) => (
                                <div key={s.id} className={cn('grid grid-cols-[32px_minmax(100px,1fr)_auto_minmax(85px,1fr)_auto_minmax(75px,1fr)_32px] items-center gap-2', s.isOverride && 'bg-amber-500/5 rounded-md px-1.5 py-1')}>
                                  <span className={cn('text-xs text-right font-medium', s.isOverride ? 'text-amber-600' : 'text-muted-foreground')}>{s.setIndex + 1}.</span>
                                  <input type="number" defaultValue={s.weightKg ?? ''} placeholder="kg" className="w-full min-w-[100px] cell-client rounded text-center py-1 text-sm" onBlur={(e) => { const v = e.target.value ? parseFloat(e.target.value) : null; if (v !== s.weightKg) onSetUpdate(s.id, { weightKg: v }); }} />
                                  <span className="text-xs text-muted-foreground">×</span>
                                  <input type="number" defaultValue={s.reps ?? ''} placeholder="reps" className="w-full min-w-[85px] cell-client rounded text-center py-1 text-sm" onBlur={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; if (v !== s.reps) onSetUpdate(s.id, { reps: v }); }} />
                                  <span className="text-xs text-muted-foreground">RIR</span>
                                  <input type="number" defaultValue={s.rir ?? ''} placeholder="—" className="w-full min-w-[75px] cell-client rounded text-center py-1 text-sm" onBlur={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; if (v !== s.rir) onSetUpdate(s.id, { rir: v }); }} />
                                  <div className="flex items-center gap-0.5">
                                    {s.isOverride && (
                                      <button onClick={() => handleRevertClick(s.id, exercise.id)} className="p-1 hover:bg-muted rounded" title="Revertir"><RotateCcw className="h-3.5 w-3.5 text-amber-600" /></button>
                                    )}
                                    <button onClick={() => onDeleteSet(s.id)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => handleAddSetClick(exercise.id)} disabled={addingSet === exercise.id} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 mt-1">
                                {addingSet === exercise.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Serie igual
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  {/* Notes column (after sets) */}
                  {notesCol && (
                    <td className="p-2 align-top">
                      <div className="cell-client max-w-[420px]">
                        <textarea
                          key={`${notesCol.id}-${weekNumber}`}
                          defaultValue={getCellValue(exercise.id, notesCol.id)}
                          placeholder="Notas..."
                          className="w-full min-w-[140px] min-h-[80px] resize-none bg-transparent text-sm outline-none"
                          rows={3}
                          onBlur={(e) => {
                            if (e.target.value !== getCellValue(exercise.id, notesCol.id)) {
                              handleCellChange(exercise.id, notesCol.id, e.target.value);
                            }
                          }}
                        />
                        {renderSaveIndicator(exercise.id, notesCol.id)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
