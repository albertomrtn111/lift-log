import { useState, useCallback } from 'react';
import { TrainingColumn, TrainingExercise, TrainingCell } from '@/types/training';
import { cn } from '@/lib/utils';
import { Lock, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface MobileExerciseCardsProps {
  exercises: TrainingExercise[];
  columns: TrainingColumn[];
  cells: TrainingCell[];
  weekNumber: number;
  onCellChange: (exerciseId: string, columnId: string, value: string) => void;
}

export function MobileExerciseCards({ 
  exercises, 
  columns, 
  cells, 
  weekNumber,
  onCellChange 
}: MobileExerciseCardsProps) {
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});

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
    setSaveStatus(prev => ({ ...prev, [cellKey]: 'saving' }));
    
    setTimeout(() => {
      onCellChange(exerciseId, columnId, value);
      setSaveStatus(prev => ({ ...prev, [cellKey]: 'saved' }));
      
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [cellKey]: 'idle' }));
      }, 2000);
    }, 500);
  }, [onCellChange]);

  const coachColumns = columns.filter(c => !c.editable && c.id !== 'c1');
  const clientColumns = columns.filter(c => c.editable);

  const completedCount = exercises.filter(ex => {
    const weightValue = getCellValue(ex.id, 'c7');
    const repsValue = getCellValue(ex.id, 'c8');
    return weightValue || repsValue;
  }).length;

  return (
    <div className="space-y-4 px-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="progress-bar flex-1">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${(completedCount / exercises.length) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {completedCount} / {exercises.length}
        </span>
      </div>

      {/* Exercise cards */}
      {exercises.map((exercise) => {
        const isExpanded = expandedExercise === exercise.id;
        const hasData = getCellValue(exercise.id, 'c7') || getCellValue(exercise.id, 'c8');

        return (
          <Card 
            key={exercise.id} 
            className={cn(
              'overflow-hidden transition-all animate-fade-in',
              hasData && 'border-primary/30'
            )}
          >
            {/* Exercise header */}
            <button
              onClick={() => setExpandedExercise(isExpanded ? null : exercise.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{getCellValue(exercise.id, 'c2')} series</span>
                  <span>×</span>
                  <span>{getCellValue(exercise.id, 'c3')} reps</span>
                  <span className="text-xs">RIR {getCellValue(exercise.id, 'c4')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasData && <Check className="h-4 w-4 text-success" />}
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border animate-slide-up">
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

                {/* Client inputs */}
                <div className="p-4 space-y-3">
                  <div className="text-xs font-medium text-primary uppercase">
                    Tus resultados
                  </div>
                  {clientColumns.map((col) => {
                    const value = getCellValue(exercise.id, col.id);
                    const cellKey = `${exercise.id}-${col.id}`;
                    const status = saveStatus[cellKey] || 'idle';

                    return (
                      <div key={col.id} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{col.label}</label>
                        <div className="relative">
                          {col.type === 'textarea' ? (
                            <textarea
                              defaultValue={value}
                              placeholder={`Añade ${col.label.toLowerCase()}...`}
                              className="w-full cell-client rounded-lg text-sm min-h-[60px]"
                              onBlur={(e) => {
                                if (e.target.value !== value) {
                                  handleCellChange(exercise.id, col.id, e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <input
                              type={col.type}
                              defaultValue={value}
                              placeholder={`Añade ${col.label.toLowerCase()}...`}
                              className="w-full cell-client rounded-lg text-sm"
                              onBlur={(e) => {
                                if (e.target.value !== value) {
                                  handleCellChange(exercise.id, col.id, e.target.value);
                                }
                              }}
                            />
                          )}
                          {status !== 'idle' && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2">
                              {status === 'saving' && (
                                <Loader2 className="h-4 w-4 animate-spin text-warning" />
                              )}
                              {status === 'saved' && (
                                <Check className="h-4 w-4 text-success" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
