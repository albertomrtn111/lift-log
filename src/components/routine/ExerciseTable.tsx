import { useState, useCallback } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell, CellSaveStatus } from '@/types/training';
import { cn } from '@/lib/utils';
import { Lock, Check, Loader2, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ExerciseTableProps {
  exercises: TrainingExercise[];
  columns: TrainingColumn[];
  cells: TrainingCell[];
  weekNumber: number;
  onCellChange: (exerciseId: string, columnId: string, value: string) => void;
}

export function ExerciseTable({ 
  exercises, 
  columns, 
  cells, 
  weekNumber,
  onCellChange 
}: ExerciseTableProps) {
  const [saveStatus, setSaveStatus] = useState<Record<string, CellSaveStatus>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const getCellValue = useCallback((exerciseId: string, columnId: string): string => {
    const column = columns.find(c => c.id === columnId);
    const weekToCheck = column?.scope === 'exercise' ? 0 : weekNumber;
    
    const cell = cells.find(
      c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === weekToCheck
    );
    return cell?.value || '';
  }, [cells, columns, weekNumber]);

  const handleCellChange = useCallback((exerciseId: string, columnId: string, value: string) => {
    const cellKey = `${exerciseId}-${columnId}`;
    setSaveStatus(prev => ({ ...prev, [cellKey]: { status: 'saving' } }));
    
    // Simulate save with debounce
    setTimeout(() => {
      onCellChange(exerciseId, columnId, value);
      setSaveStatus(prev => ({ 
        ...prev, 
        [cellKey]: { status: 'saved', lastSaved: new Date() } 
      }));
      
      // Clear saved status after 2 seconds
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [cellKey]: { status: 'idle' } }));
      }, 2000);
    }, 500);
  }, [onCellChange]);

  const renderSaveIndicator = (exerciseId: string, columnId: string) => {
    const cellKey = `${exerciseId}-${columnId}`;
    const status = saveStatus[cellKey]?.status || 'idle';

    if (status === 'idle') return null;

    return (
      <span className={cn(
        'save-indicator ml-1',
        status === 'saved' && 'save-indicator-saved',
        status === 'saving' && 'save-indicator-saving',
        status === 'error' && 'save-indicator-error'
      )}>
        {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === 'saved' && <Check className="h-3 w-3" />}
        {status === 'error' && <AlertCircle className="h-3 w-3" />}
      </span>
    );
  };

  const completedCount = exercises.filter(ex => {
    const weightValue = getCellValue(ex.id, 'c7');
    const repsValue = getCellValue(ex.id, 'c8');
    return weightValue || repsValue;
  }).length;

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-3 px-4">
        <div className="progress-bar flex-1">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${(completedCount / exercises.length) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {completedCount} / {exercises.length} ejercicios
        </span>
      </div>

      {/* Table container */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col, index) => (
                <th
                  key={col.id}
                  className={cn(
                    'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    index === 0 && 'sticky-col bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {!col.editable && col.id !== 'c1' && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="h-3 w-3 text-muted-foreground/50" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Definido por tu entrenador</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exercises.map((exercise, rowIndex) => (
              <tr 
                key={exercise.id} 
                className={cn(
                  'border-b border-border transition-colors',
                  rowIndex % 2 === 0 ? 'bg-card' : 'bg-card/50'
                )}
              >
                {columns.map((col, colIndex) => {
                  const value = col.id === 'c1' ? exercise.name : getCellValue(exercise.id, col.id);
                  const cellKey = `${exercise.id}-${col.id}`;
                  const isEditing = editingCell === cellKey;
                  
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        colIndex === 0 && 'sticky-col font-medium',
                        !col.editable ? 'cell-coach' : 'p-1'
                      )}
                    >
                      {col.editable ? (
                        <div className="cell-client">
                          {col.type === 'textarea' ? (
                            <textarea
                              value={value}
                              placeholder="..."
                              className="w-full min-w-[100px] resize-none bg-transparent text-sm outline-none"
                              rows={1}
                              onFocus={() => setEditingCell(cellKey)}
                              onBlur={(e) => {
                                setEditingCell(null);
                                if (e.target.value !== getCellValue(exercise.id, col.id)) {
                                  handleCellChange(exercise.id, col.id, e.target.value);
                                }
                              }}
                              onChange={(e) => {
                                // Local state update would go here
                              }}
                            />
                          ) : (
                            <input
                              type={col.type}
                              value={value}
                              placeholder="..."
                              className="w-full min-w-[60px] bg-transparent text-sm outline-none"
                              onFocus={() => setEditingCell(cellKey)}
                              onBlur={(e) => {
                                setEditingCell(null);
                                if (e.target.value !== getCellValue(exercise.id, col.id)) {
                                  handleCellChange(exercise.id, col.id, e.target.value);
                                }
                              }}
                            />
                          )}
                          {renderSaveIndicator(exercise.id, col.id)}
                        </div>
                      ) : (
                        <span className="text-sm">{value}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
