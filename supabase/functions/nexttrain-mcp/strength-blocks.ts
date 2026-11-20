// Superseries en las respuestas del MCP (NXT-121). Mismas reglas que la web:
// src/lib/training/supersets.js.
import { supersetInfoById } from '../../../src/lib/training/supersets.js'
import type { Row } from './shared.ts'

function orderOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Letra de cada ejercicio en su día (A, B, C1, C2…) y su superserie, si la tiene.
 * Mismas reglas que la web: src/lib/training/supersets.js.
 */
export function strengthBlocks(exercises: Row[]) {
  const byDay = new Map<string, Row[]>()
  for (const exercise of exercises) {
    const list = byDay.get(exercise.day_id) ?? []
    list.push(exercise)
    byDay.set(exercise.day_id, list)
  }
  const info = new Map<string, any>()
  for (const list of byDay.values()) {
    list.sort((a, b) => orderOf(a.order_index) - orderOf(b.order_index))
    for (const [id, entry] of supersetInfoById(list)) info.set(id, entry)
  }
  return info
}

/** Datos de superserie de un ejercicio para las respuestas del MCP (null si va suelto). */
export function supersetOutput(entry: any) {
  if (!entry?.isSuperset) return null
  return {
    kind: entry.kind, label: entry.letter, rounds: entry.rounds, position: entry.position + 1, size: entry.size,
    with: entry.with, rest_meaning: entry.isLast ? 'rest_seconds es el descanso tras la ronda' : 'rest_seconds es el paso al siguiente ejercicio (0 = sin descanso)',
  }
}


/** Texto común para el campo `superset` de las herramientas que escriben programas. */
export const SUPERSET_FIELD_DESCRIPTION = 'Superserie: la misma etiqueta (por ejemplo "C") en 2 a 4 ejercicios seguidos del mismo día los enlaza para hacerlos alternando series (C1, C2…). Dentro del bloque, rest_seconds de cada ejercicio es el paso al siguiente (0 = sin descanso) y el del último, el descanso tras la ronda; las rondas son el mayor número de series. Un ejercicio que se queda solo con su etiqueta va suelto.'

/** Frase para las descripciones de las herramientas de fuerza. */
export const SUPERSET_TOOL_NOTE = 'Superseries: pon la misma etiqueta en `superset` a 2-4 ejercicios seguidos del mismo día; get_program_history devuelve la letra (block) y la superserie de cada ejercicio.'
