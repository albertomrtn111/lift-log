import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarDays, Scale, Footprints, Moon, Save, Check, CalendarIcon } from 'lucide-react';
import { mockDailyMetrics } from '@/data/mockData';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function ProgressPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weight, setWeight] = useState('');
  const [steps, setSteps] = useState('');
  const [sleep, setSleep] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  // Get dates with data for calendar highlighting
  const datesWithData = mockDailyMetrics.map(m => new Date(m.date));

  return (
    <div className="min-h-screen pb-4">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Progreso diario</h1>
              <p className="text-sm text-muted-foreground">Registra tus métricas</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={es}
              className="pointer-events-auto"
              modifiers={{
                hasData: datesWithData
              }}
              modifiersStyles={{
                hasData: { backgroundColor: 'hsl(var(--primary) / 0.1)' }
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Metrics cards */}
        <div className="grid grid-cols-1 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Peso</h3>
                <p className="text-xs text-muted-foreground">En kg, por la mañana</p>
              </div>
            </div>
            <Input
              type="number"
              step="0.1"
              placeholder="78.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="text-lg"
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Footprints className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="font-semibold">Pasos</h3>
                <p className="text-xs text-muted-foreground">Total del día</p>
              </div>
            </div>
            <Input
              type="number"
              placeholder="10000"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              className="text-lg"
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Moon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Sueño</h3>
                <p className="text-xs text-muted-foreground">Horas de descanso</p>
              </div>
            </div>
            <Input
              type="number"
              step="0.5"
              placeholder="7.5"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              className="text-lg"
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold">Notas del día</h3>
            </div>
            <Textarea
              placeholder="¿Cómo te has sentido? ¿Algo a destacar?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </Card>
        </div>

        <Button onClick={handleSave} className="w-full" size="lg">
          {saveStatus === 'saving' ? (
            <>Guardando...</>
          ) : saveStatus === 'saved' ? (
            <><Check className="h-4 w-4 mr-2" /> Guardado</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Guardar progreso</>
          )}
        </Button>

        {/* Recent entries */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Últimos registros</h3>
          <div className="space-y-3">
            {mockDailyMetrics.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground w-16">
                  {format(new Date(entry.date), 'EEE dd', { locale: es })}
                </span>
                <div className="flex-1 flex items-center gap-4 text-sm">
                  {entry.weight && (
                    <span className="flex items-center gap-1">
                      <Scale className="h-3 w-3 text-primary" />
                      {entry.weight} kg
                    </span>
                  )}
                  {entry.steps && (
                    <span className="flex items-center gap-1">
                      <Footprints className="h-3 w-3 text-success" />
                      {entry.steps.toLocaleString()}
                    </span>
                  )}
                  {entry.sleepHours && (
                    <span className="flex items-center gap-1">
                      <Moon className="h-3 w-3 text-primary" />
                      {entry.sleepHours}h
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
