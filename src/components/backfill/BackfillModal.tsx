import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Circle, CircleDot, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

type RangeOption = 7 | 14;

interface BackfillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: (props: {
    days: Date[];
    onSaveAll: () => void;
    saveStatus: 'idle' | 'saving' | 'saved';
  }) => React.ReactNode;
}

export function BackfillModal({ open, onOpenChange, title, children }: BackfillModalProps) {
  const [range, setRange] = useState<RangeOption>(7);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const today = new Date();
  const days = Array.from({ length: range }, (_, i) => subDays(today, range - 1 - i));

  const handleSaveAll = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
        onOpenChange(false);
      }, 1000);
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Range selector */}
        <div className="flex gap-2 py-2">
          <Button
            variant={range === 7 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRange(7)}
          >
            7 días
          </Button>
          <Button
            variant={range === 14 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRange(14)}
          >
            14 días
          </Button>
        </div>

        {/* Content area with scroll */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {children({ days, onSaveAll: handleSaveAll, saveStatus })}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-border">
          <Button 
            onClick={handleSaveAll} 
            className="w-full" 
            size="lg"
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <>Guardando...</>
            ) : saveStatus === 'saved' ? (
              <><Check className="h-4 w-4 mr-2" /> Guardado</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Guardar todo</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Status indicator component
export function DayStatusIndicator({ 
  isComplete, 
  isPartial 
}: { 
  isComplete: boolean; 
  isPartial: boolean;
}) {
  if (isComplete) {
    return <Check className="h-4 w-4 text-success" />;
  }
  if (isPartial) {
    return <CircleDot className="h-4 w-4 text-warning" />;
  }
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

// Format date helper
export function formatBackfillDate(date: Date): string {
  return format(date, "EEE, d MMM", { locale: es });
}
