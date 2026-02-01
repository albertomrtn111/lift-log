import { ClipboardList, Utensils, CalendarDays, BarChart3, User, Timer } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: ClipboardList, label: 'Rutina' },
  { to: '/diet', icon: Utensils, label: 'Dieta' },
  { to: '/running', icon: Timer, label: 'Running' },
  { to: '/progress', icon: CalendarDays, label: 'Progreso' },
  { to: '/summary', icon: BarChart3, label: 'Resumen' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card glass">
      <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'nav-item flex-1 max-w-[80px]',
                isActive && 'nav-item-active'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
