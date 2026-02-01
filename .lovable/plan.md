
# Plan de Implementacion: Backfill + Running Tab

## Resumen Ejecutivo

Este plan cubre dos funcionalidades nuevas:
1. **Backfill**: Modal para rellenar dias pendientes en Dieta y Progreso
2. **Running Tab**: Nueva pestana para entrenamientos de carrera

---

## Parte 1: Backfill (Rellenar Dias Pendientes)

### Objetivo
Permitir al cliente completar en 2-3 minutos los dias sin datos (peso, pasos, sueno, adherencia).

### Componentes a Crear

```text
src/
  components/
    backfill/
      BackfillModal.tsx          # Modal principal reutilizable
      ProgressBackfillContent.tsx # Contenido para metricas diarias
      DietBackfillContent.tsx     # Contenido para adherencia dieta
      BackfillDayRow.tsx          # Fila individual por dia
```

### Estructura del Modal

#### A) Selector de Rango
- Botones: "7 dias" (default) | "14 dias" | "Personalizado"
- Opcion personalizada: dos date pickers (desde/hasta)

#### B) Tabla de Dias (lista vertical)
Cada fila muestra:
- **Fecha**: "lun, 29 ene"
- **Inputs inline** (compactos, en una linea)
- **Indicador de estado**: icono de circulo vacio/parcial/completo

**Progreso (por fila)**:
| Fecha | Peso (kg) | Pasos | Sueno (h) | Estado |
|-------|-----------|-------|-----------|--------|

**Dieta (por fila)**:
| Fecha | Adherencia (%) | Notas | Estado |
|-------|----------------|-------|--------|

#### C) Acciones
- Boton principal: "Guardar todo"
- Auto-save opcional por fila al blur
- Indicador de progreso: "3/7 dias completados"

#### D) Ayudas de Velocidad
- Boton "Copiar valor anterior" en peso y adherencia
- Validaciones: peso 0-300 kg, sueno 0-24 h

### Integracion en Paginas Existentes

**DietPage.tsx**:
- Agregar boton "Rellenar dias pendientes" en la seccion Macros
- Posicion: debajo de la card "Adherencia de hoy"

**ProgressPage.tsx**:
- Agregar boton "Rellenar dias pendientes" en el header o debajo del date picker

### Tipos a Agregar

```typescript
// src/types/training.ts
interface BackfillEntry {
  date: string;
  isComplete: boolean;
  isPartial: boolean;
}

interface ProgressBackfillData {
  date: string;
  weight?: number;
  steps?: number;
  sleepHours?: number;
  notes?: string;
}

interface DietBackfillData {
  date: string;
  adherencePercent?: number;
  notes?: string;
}
```

### Mock Data a Agregar
- Funcion `generateEmptyDays(range: number)` para simular dias sin datos

---

## Parte 2: Nueva Pestana Running

### Objetivo
Vista tipo "TrainingPeaks light" para clientes con entrenamientos de carrera.

### Nuevos Archivos

```text
src/
  pages/
    RunningPage.tsx              # Pagina principal
  components/
    running/
      WeekNavigation.tsx         # Navegacion entre semanas
      WeekCalendarView.tsx       # Vista de 7 dias
      RunningDayCard.tsx         # Card por dia (sesion)
      WeeklySummaryCard.tsx      # Resumen semanal
      RunningSessionDetail.tsx   # Detalle de entrenamiento
      SessionLogForm.tsx         # Formulario de registro
      RecentSessionsList.tsx     # Historial reciente
```

### Tipos a Agregar

```typescript
// src/types/running.ts
type SessionType = 'easy' | 'intervals' | 'tempo' | 'long' | 'recovery' | 'rest';
type IntensityZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

interface RunningSession {
  id: string;
  date: string;
  weekNumber: number;
  dayOfWeek: number; // 0-6
  name: string;
  type: SessionType;
  targetDistance?: number; // km
  targetDuration?: number; // minutos
  targetZone?: IntensityZone;
  targetRPE?: number;
  structure?: SessionBlock[];
  coachNotes?: string;
  isCompleted: boolean;
}

interface SessionBlock {
  id: string;
  name: string; // "Calentamiento", "Principal", "Enfriamiento"
  description: string;
}

interface SessionLog {
  id: string;
  sessionId: string;
  actualDistance?: number;
  actualDuration?: number; // minutos
  averagePace?: string; // "5:30 min/km"
  rpe?: number; // 1-10
  notes?: string;
  completedAt: string;
}

interface WeeklySummary {
  weekNumber: number;
  plannedDistance: number;
  completedDistance: number;
  plannedSessions: number;
  completedSessions: number;
}
```

### Pantalla Principal: RunningPage

```text
+------------------------------------------+
| [<-] Semana 3          Running      [->] |
| Tu plan de carrera                       |
+------------------------------------------+
| RESUMEN SEMANAL                          |
| [32 km planificados] [18 km completados] |
| [Sesiones: 3/5]                          |
+------------------------------------------+
| LUN 27  | Rodaje Z2      | 8 km  | [v]  |
| MAR 28  | Series         | 10 km | [ ]  |
| MIE 29  | Descanso       | -     | [-]  |
| JUE 30  | Tempo          | 6 km  | [ ]  |
| VIE 31  | Rodaje suave   | 8 km  | [ ]  |
| SAB 1   | Tirada larga   | 16 km | [ ]  |
| DOM 2   | Descanso       | -     | [-]  |
+------------------------------------------+
| ULTIMAS SESIONES                         |
| dom 26 | Rodaje | 8.2 km | 42:15 | OK   |
| sab 25 | Series | 9.8 km | 48:30 | OK   |
+------------------------------------------+
```

### Pantalla de Detalle: RunningSessionDetail

Al tocar un dia se abre Sheet desde la derecha:

```text
+------------------------------------------+
| [X]           Series 6x1km               |
+------------------------------------------+
| ENTRENAMIENTO PRESCRITO                  |
|                                          |
| Objetivo: 10 km | Intensidad: Z4/Z5      |
|                                          |
| Estructura:                              |
| - Calentamiento: 10' Z1-Z2               |
| - Principal: 6x1km ritmo 10K, rec 2'     |
| - Enfriamiento: 10' suave                |
|                                          |
| Notas del entrenador:                    |
| "Controla el primer km, acelera al       |
| final si te encuentras bien"             |
+------------------------------------------+
| TU REGISTRO                              |
|                                          |
| Distancia realizada    [____] km         |
| Tiempo total           [____] min        |
| Ritmo medio            [____] min/km     |
| RPE (1-10)             [1][2]...[10]     |
| Notas                  [__________]      |
|                                          |
| [       Guardar sesion        ]          |
+------------------------------------------+
```

### Navegacion

**BottomNav.tsx**: Agregar nuevo item
```typescript
{ to: '/running', icon: Timer, label: 'Running' }
```

**App.tsx**: Agregar ruta
```typescript
<Route path="/running" element={<RunningPage />} />
```

### Mock Data

```typescript
// src/data/runningMockData.ts
export const mockRunningSessions: RunningSession[] = [
  {
    id: 'rs1',
    date: '2024-01-29',
    weekNumber: 4,
    dayOfWeek: 1,
    name: 'Rodaje Z2',
    type: 'easy',
    targetDistance: 8,
    targetZone: 'Z2',
    coachNotes: 'Ritmo conversacional, sin forzar',
    isCompleted: false,
  },
  // ... mas sesiones
];

export const mockSessionLogs: SessionLog[] = [
  {
    id: 'sl1',
    sessionId: 'rs0',
    actualDistance: 8.2,
    actualDuration: 42,
    averagePace: '5:08',
    rpe: 5,
    completedAt: '2024-01-28T08:30:00',
  },
];
```

### Iconografia por Tipo de Sesion
- **easy/recovery**: Footprints (verde suave)
- **intervals**: Zap (naranja intenso)
- **tempo**: TrendingUp (amarillo)
- **long**: Route (azul)
- **rest**: Moon (gris)

---

## Orden de Implementacion

### Fase 1: Backfill (estimado: 1 sesion)
1. Crear tipos en `training.ts`
2. Crear `BackfillModal.tsx` base
3. Crear `ProgressBackfillContent.tsx`
4. Integrar en `ProgressPage.tsx`
5. Crear `DietBackfillContent.tsx`
6. Integrar en `DietPage.tsx`
7. Agregar mock data para dias vacios

### Fase 2: Running (estimado: 2 sesiones)
1. Crear tipos en `running.ts`
2. Crear mock data `runningMockData.ts`
3. Actualizar navegacion (BottomNav + App.tsx)
4. Crear `RunningPage.tsx` con vista semanal
5. Crear `WeekNavigation.tsx`
6. Crear `RunningDayCard.tsx`
7. Crear `WeeklySummaryCard.tsx`
8. Crear `RunningSessionDetail.tsx` (Sheet)
9. Crear `SessionLogForm.tsx`
10. Crear `RecentSessionsList.tsx`

---

## Detalles Tecnicos

### Componentes UI Reutilizados
- `Sheet` para detalle de sesion running
- `Dialog` para modal de backfill
- `Slider` para RPE y adherencia
- `Input` para campos numericos
- `Textarea` para notas
- `Button`, `Card`, `Badge` existentes

### Patrones a Seguir
- Estado local con `useState` (igual que RoutinePage)
- Mock data hasta conectar Supabase
- Auto-save con debounce (simular con setTimeout)
- Responsive: mobile-first con cards colapsables

### Validaciones
- Peso: 0-300 kg, step 0.1
- Sueno: 0-24 h, step 0.5
- Pasos: 0-99999
- Adherencia: 0-100%, step 5
- RPE: 1-10 (botones discretos)
- Distancia: 0-100 km, step 0.1
- Duracion: 0-999 min

---

## Resultado Esperado

### Backfill
- Boton visible en Dieta y Progreso
- Modal que muestra 7/14 dias en lista
- Inputs rapidos inline
- Guardar todo en un click
- Visual claro de dias completos/pendientes

### Running
- Nueva pestana en navegacion inferior
- Vista semanal clara tipo calendario
- Detalle de sesion con estructura del entreno
- Formulario rapido para registrar resultados
- Historial de sesiones recientes
- Resumen semanal con km planificados vs completados
