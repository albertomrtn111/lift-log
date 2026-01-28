import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Mail, 
  Target, 
  MessageCircle,
  ChevronRight,
  LogOut,
  Settings,
  HelpCircle
} from 'lucide-react';
import { mockProfile } from '@/data/mockData';

export default function ProfilePage() {
  const initials = mockProfile.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen pb-4">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Perfil</h1>
              <p className="text-sm text-muted-foreground">Tu información</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Profile card */}
        <Card className="p-6 text-center">
          <Avatar className="w-20 h-20 mx-auto mb-4 ring-4 ring-primary/10">
            <AvatarImage src={mockProfile.avatarUrl} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold">{mockProfile.name}</h2>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
            <Mail className="h-3 w-3" />
            {mockProfile.email}
          </p>
        </Card>

        {/* Coach info */}
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Tu entrenador</h3>
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-accent text-accent-foreground font-semibold">
                MT
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-semibold">{mockProfile.coachName}</p>
              <Badge variant="secondary" className="mt-1 text-xs">
                Entrenador personal
              </Badge>
            </div>
            <Button size="sm" className="gap-1">
              <MessageCircle className="h-4 w-4" />
              Contactar
            </Button>
          </div>
        </Card>

        {/* Goal */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold">Tu objetivo</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {mockProfile.goal}
              </p>
            </div>
          </div>
        </Card>

        {/* Menu items */}
        <Card className="divide-y divide-border">
          <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-left font-medium">Configuración</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-left font-medium">Ayuda</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-destructive">
            <LogOut className="h-5 w-5" />
            <span className="flex-1 text-left font-medium">Cerrar sesión</span>
          </button>
        </Card>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground">
          FitTrack v1.0.0
        </p>
      </div>
    </div>
  );
}
