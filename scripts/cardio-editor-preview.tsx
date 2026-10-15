// Entorno local para verificar el formulario real sin guardar en Supabase.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CardioSessionForm } from '../src/components/coach/workspace/CardioSessionForm'

function Preview() {
  const [initial, setInitial] = useState<any>()
  const [saved, setSaved] = useState<any>()
  const [revision, setRevision] = useState(0)
  return <main className="mx-auto max-w-2xl space-y-4 p-4">
    <h1 className="text-xl font-bold">Prueba local de cardio</h1>
    <p className="text-sm text-muted-foreground">Este formulario no modifica datos de usuarios.</p>
    <div hidden><CardioSessionForm onSubmit={async () => {}} /></div>
    <button className="min-h-11 rounded border px-3" onClick={() => { setInitial(saved); setRevision(value => value + 1) }} disabled={!saved}>Reabrir sesión guardada</button>
    <CardioSessionForm key={revision} initialData={initial} onSubmit={async data => { setSaved(data) }} />
    <output aria-label="Sesión guardada" className="block break-all text-xs">{saved ? JSON.stringify(saved) : 'Sin guardar'}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
