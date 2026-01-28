import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Utensils, 
  Flame, 
  Beef, 
  Wheat, 
  Droplet, 
  Footprints, 
  Heart,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from 'lucide-react';
import { mockMacroPlan, mockDietPlan, mockAdherence } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function DietPage() {
  const [adherence, setAdherence] = useState(85);
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  return (
    <div className="min-h-screen pb-4">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Utensils className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Dieta</h1>
              <p className="text-sm text-muted-foreground">Tu plan nutricional</p>
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue="macros" className="px-4 pt-4">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="macros">Macros</TabsTrigger>
          <TabsTrigger value="meals">Plan de comidas</TabsTrigger>
        </TabsList>

        <TabsContent value="macros" className="space-y-4 animate-fade-in">
          {/* Active badge */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-success/10 text-success border-0">
              Activo desde: {format(new Date(mockMacroPlan.effectiveFrom), 'dd MMM', { locale: es })}
            </Badge>
          </div>

          {/* Macro cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="macro-card card-hover">
              <Flame className="h-6 w-6 text-accent mb-2" />
              <span className="text-2xl font-bold">{mockMacroPlan.kcal}</span>
              <span className="text-xs text-muted-foreground">kcal</span>
            </Card>
            <Card className="macro-card card-hover">
              <Beef className="h-6 w-6 text-destructive mb-2" />
              <span className="text-2xl font-bold">{mockMacroPlan.protein}g</span>
              <span className="text-xs text-muted-foreground">Proteína</span>
            </Card>
            <Card className="macro-card card-hover">
              <Wheat className="h-6 w-6 text-warning mb-2" />
              <span className="text-2xl font-bold">{mockMacroPlan.carbs}g</span>
              <span className="text-xs text-muted-foreground">Carbohidratos</span>
            </Card>
            <Card className="macro-card card-hover">
              <Droplet className="h-6 w-6 text-warning/80 mb-2" />
              <span className="text-2xl font-bold">{mockMacroPlan.fat}g</span>
              <span className="text-xs text-muted-foreground">Grasa</span>
            </Card>
          </div>

          {/* Extra goals */}
          {(mockMacroPlan.stepsGoal || mockMacroPlan.cardioGoal) && (
            <div className="flex gap-3">
              {mockMacroPlan.stepsGoal && (
                <Card className="flex-1 flex items-center gap-3 p-4">
                  <Footprints className="h-5 w-5 text-primary" />
                  <div>
                    <span className="text-lg font-semibold">{mockMacroPlan.stepsGoal.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-1">pasos/día</span>
                  </div>
                </Card>
              )}
              {mockMacroPlan.cardioGoal && (
                <Card className="flex-1 flex items-center gap-3 p-4">
                  <Heart className="h-5 w-5 text-destructive/80" />
                  <span className="text-sm font-medium">{mockMacroPlan.cardioGoal}</span>
                </Card>
              )}
            </div>
          )}

          {/* Daily adherence input */}
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Adherencia de hoy
            </h3>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">¿Cómo has seguido el plan?</span>
                <span className="font-semibold text-primary">{adherence}%</span>
              </div>
              <Slider
                value={[adherence]}
                onValueChange={([value]) => setAdherence(value)}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Notas del día</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="¿Alguna observación?"
                className="min-h-[60px] resize-none"
              />
            </div>

            <Button onClick={handleSave} className="w-full">
              {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : 'Guardar'}
            </Button>
          </Card>

          {/* History */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Últimos 7 días</h3>
            <div className="space-y-2">
              {mockAdherence.slice(0, 7).map((day) => (
                <div key={day.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground w-20">
                    {format(new Date(day.date), 'EEE dd', { locale: es })}
                  </span>
                  <div className="flex-1">
                    <div className="progress-bar h-1.5">
                      <div 
                        className={cn(
                          "progress-bar-fill",
                          day.adherencePercent < 70 && "bg-destructive",
                          day.adherencePercent >= 70 && day.adherencePercent < 90 && "bg-warning"
                        )}
                        style={{ width: `${day.adherencePercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={cn(
                    "text-sm font-medium w-10 text-right",
                    day.adherencePercent >= 90 && "text-success",
                    day.adherencePercent >= 70 && day.adherencePercent < 90 && "text-warning",
                    day.adherencePercent < 70 && "text-destructive"
                  )}>
                    {day.adherencePercent}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="meals" className="space-y-4 animate-fade-in">
          <p className="text-sm text-muted-foreground">
            Opciones propuestas por tu entrenador. Elige combinaciones que encajen con tus macros.
          </p>

          {mockDietPlan.meals.map((mealTime) => (
            <Collapsible key={mealTime.id} className="space-y-2">
              <Card className="overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <h3 className="font-semibold">{mealTime.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{mealTime.options.length} opciones</Badge>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="border-t border-border divide-y divide-border">
                    {mealTime.options.map((option) => (
                      <div key={option.id} className="p-4">
                        <h4 className="font-medium text-sm mb-2">{option.name}</h4>
                        <ul className="space-y-1 mb-2">
                          {option.foods.map((food, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-primary">•</span>
                              {food}
                            </li>
                          ))}
                        </ul>
                        {option.tips && (
                          <p className="text-xs text-primary bg-primary/5 px-2 py-1 rounded inline-block">
                            💡 {option.tips}
                          </p>
                        )}
                        {option.coachNote && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                            <MessageSquare className="h-3 w-3 mt-0.5" />
                            {option.coachNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
