import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RunningSession, SessionLog } from '@/types/running';
import { 
  Target, 
  Activity, 
  MessageSquare, 
  Save, 
  Check,
  Clock,
  Route as RouteIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunningSessionDetailProps {
  session: RunningSession | null;
  existingLog?: SessionLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (log: Partial<SessionLog>) => void;
}

export function RunningSessionDetail({ 
  session, 
  existingLog,
  open, 
  onOpenChange,
  onSave 
}: RunningSessionDetailProps) {
  const [distance, setDistance] = useState(existingLog?.actualDistance?.toString() ?? '');
  const [duration, setDuration] = useState(existingLog?.actualDuration?.toString() ?? '');
  const [pace, setPace] = useState(existingLog?.averagePace ?? '');
  const [rpe, setRpe] = useState<number | null>(existingLog?.rpe ?? null);
  const [notes, setNotes] = useState(existingLog?.notes ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  if (!session) return null;

  const isRest = session.type === 'rest';

  const handleSave = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      onSave({
        sessionId: session.id,
        actualDistance: distance ? parseFloat(distance) : undefined,
        actualDuration: duration ? parseInt(duration) : undefined,
        averagePace: pace || undefined,
        rpe: rpe ?? undefined,
        notes: notes || undefined,
        completedAt: new Date().toISOString(),
      });
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
        onOpenChange(false);
      }, 1000);
    }, 500);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{session.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Prescribed training (read-only) */}
          <Card className="p-4 space-y-4 bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              Entrenamiento prescrito
            </h3>

            {/* Goals */}
            <div className="flex flex-wrap gap-2">
              {session.targetDistance && (
                <Badge variant="secondary" className="gap-1">
                  <RouteIcon className="h-3 w-3" />
                  {session.targetDistance} km
                </Badge>
              )}
              {session.targetDuration && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {session.targetDuration} min
                </Badge>
              )}
              {session.targetZone && (
                <Badge variant="secondary">
                  Zona {session.targetZone}
                </Badge>
              )}
              {session.targetRPE && (
                <Badge variant="secondary">
                  RPE {session.targetRPE}
                </Badge>
              )}
            </div>

            {/* Structure */}
            {session.structure && session.structure.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Estructura
                </h4>
                <div className="space-y-1.5">
                  {session.structure.map((block) => (
                    <div 
                      key={block.id} 
                      className="flex items-start gap-2 text-sm bg-background/50 p-2 rounded"
                    >
                      <span className="text-primary">•</span>
                      <div>
                        <span className="font-medium">{block.name}:</span>{' '}
                        <span className="text-muted-foreground">{block.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coach notes */}
            {session.coachNotes && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Notas del entrenador
                </h4>
                <p className="text-sm text-muted-foreground bg-background/50 p-2 rounded">
                  {session.coachNotes}
                </p>
              </div>
            )}
          </Card>

          {/* Client log (editable) - only show for non-rest days */}
          {!isRest && (
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-success" />
                Tu registro
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Distancia (km)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="8.5"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tiempo (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    placeholder="45"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Ritmo medio (min/km)</Label>
                <Input
                  placeholder="5:30"
                  value={pace}
                  onChange={(e) => setPace(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">RPE (1-10)</Label>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                    <Button
                      key={value}
                      variant={rpe === value ? 'default' : 'outline'}
                      size="sm"
                      className={cn(
                        "flex-1 h-9 p-0",
                        rpe === value && value <= 4 && "bg-success hover:bg-success/90",
                        rpe === value && value >= 5 && value <= 7 && "bg-warning hover:bg-warning/90",
                        rpe === value && value >= 8 && "bg-destructive hover:bg-destructive/90"
                      )}
                      onClick={() => setRpe(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  placeholder="¿Cómo te has sentido?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
              </div>

              <Button 
                onClick={handleSave} 
                className="w-full" 
                size="lg"
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? (
                  <>Guardando...</>
                ) : saveStatus === 'saved' ? (
                  <><Check className="h-4 w-4 mr-2" /> Guardado</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Guardar sesión</>
                )}
              </Button>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
