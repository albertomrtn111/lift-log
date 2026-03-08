/**
 * dietCsvParser.ts
 * ================
 * Pure CSV parser for "Dieta por opciones" import.
 *
 * Accepts CSV headers in Spanish (user-facing) or English (legacy):
 *   Tipo de día | day_type
 *   Nombre de la comida | meal_name
 *   Nombre de la opción | option_name
 *   Cantidad | amount
 *   Unidad | unit
 *   Nombre del alimento | food_name
 *
 * day_type normalization:
 *   Entreno | entreno | training    → training
 *   Descanso | descanso | rest      → rest
 *   Normal | normal | default       → default
 *   Doble sesión | doble_sesion     → training  (with warning)
 *
 * Output: DietMealInput[] — same type consumed by createDietPlanOptions()
 */

import type { DayType, DietMealInput, DietMealOptionInput, DietOptionItemInput } from '@/data/nutrition/types'

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface CsvRowError {
    row: number          // 1-indexed (includes header row → data rows start at 2)
    column?: string
    message: string
}

export interface CsvParseWarning {
    row: number
    message: string
}

export interface CsvParseStats {
    totalRows: number    // data rows processed
    dayTypes: number
    meals: number
    options: number
    items: number
}

export interface CsvParseSuccess {
    ok: true
    meals: DietMealInput[]
    stats: CsvParseStats
    warnings: CsvParseWarning[]
}

export interface CsvParseFailure {
    ok: false
    errors: CsvRowError[]
    warnings: CsvParseWarning[]
}

export type CsvParseResult = CsvParseSuccess | CsvParseFailure

// ============================================================================
// CONSTANTS
// ============================================================================

// Internal column keys used after header normalization
const REQUIRED_COLUMNS = ['day_type', 'meal_name', 'option_name', 'amount', 'unit', 'food_name'] as const

// Spanish user-facing names for each internal column
const COLUMN_LABELS: Record<string, string> = {
    day_type: 'Tipo de día',
    meal_name: 'Nombre de la comida',
    option_name: 'Nombre de la opción',
    amount: 'Cantidad',
    unit: 'Unidad',
    food_name: 'Nombre del alimento',
}

/**
 * Maps user-facing Spanish headers (lowercased) to internal column keys.
 * Also accepts the English/internal keys directly for backward compatibility.
 */
const HEADER_ALIASES: Record<string, string> = {
    // Spanish names (lowercased)
    'tipo de día': 'day_type',
    'tipo de dia': 'day_type',
    'nombre de la comida': 'meal_name',
    'comida': 'meal_name',
    'nombre de la opción': 'option_name',
    'nombre de la opcion': 'option_name',
    'opción': 'option_name',
    'opcion': 'option_name',
    'cantidad': 'amount',
    'cantidad (gramos)': 'amount',
    'unidad': 'unit',
    'nombre del alimento': 'food_name',
    'alimento': 'food_name',
    // English/internal keys (backward compat)
    'day_type': 'day_type',
    'meal_name': 'meal_name',
    'option_name': 'option_name',
    'amount': 'amount',
    'unit': 'unit',
    'food_name': 'food_name',
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

// Normalization maps — all values lowercased before lookup
const DAY_TYPE_MAP: Record<string, DayType> = {
    // training
    entreno: 'training',
    training: 'training',
    train: 'training',
    entrenamiento: 'training',
    // rest
    descanso: 'training', // will be overwritten below
    rest: 'rest',
    // default (normal)
    normal: 'default',
    default: 'default',
    'día normal': 'default',
    'dia normal': 'default',
}

// Correct the mistake above
DAY_TYPE_MAP['descanso'] = 'rest'

// Values that map to training after normalization but with a warning
const DOUBLE_SESSION_SYNONYMS = new Set([
    'doble_sesion',
    'doble sesion',
    'doble sesión',
    'doblesesion',
    'double session',
    'double_session',
    'doble',
])

// ============================================================================
// MAIN PARSE FUNCTION
// ============================================================================

/**
 * Parses a CSV string and returns either a success with DietMealInput[] or a
 * failure with row-level errors.
 *
 * @param csvText - Raw CSV text content
 */
export function parseDietCsv(csvText: string): CsvParseResult {
    const errors: CsvRowError[] = []
    const warnings: CsvParseWarning[] = []

    // ---- 1. Split into lines --------------------------------------------------
    const lines = csvText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0)

    if (lines.length === 0) {
        errors.push({ row: 1, message: 'El archivo CSV está vacío.' })
        return { ok: false, errors, warnings }
    }

    // ---- 2. Parse header (accepts Spanish or English) --------------------------
    const headerLine = lines[0]
    const rawHeaders = parseCsvLine(headerLine).map(h => h.trim())

    // Normalize headers: map Spanish/English to internal keys
    const normalizedHeaders = rawHeaders.map(h => {
        const lower = h.toLowerCase()
        return HEADER_ALIASES[lower] ?? lower
    })

    const missingCols = REQUIRED_COLUMNS.filter(col => !normalizedHeaders.includes(col))
    if (missingCols.length > 0) {
        // Show missing columns in Spanish
        const missingLabels = missingCols.map(col => COLUMN_LABELS[col] || col)
        errors.push({
            row: 1,
            message: `Columnas obligatorias faltantes: ${missingLabels.join(', ')}.`,
        })
        return { ok: false, errors, warnings }
    }

    // Column index map (using normalized header keys)
    const colIdx: Record<string, number> = {}
    for (const col of REQUIRED_COLUMNS) {
        colIdx[col] = normalizedHeaders.indexOf(col)
    }

    const dataLines = lines.slice(1)

    if (dataLines.length === 0) {
        errors.push({ row: 2, message: 'El CSV no contiene filas de datos (solo el encabezado).' })
        return { ok: false, errors, warnings }
    }

    // ---- 3. Parse data rows ---------------------------------------------------
    // We'll collect parsed rows and then assemble structure
    interface ParsedRow {
        rowNum: number
        dayType: DayType
        mealName: string
        optionName: string
        amount: number
        unit: string
        foodName: string
    }

    const parsedRows: ParsedRow[] = []

    for (let i = 0; i < dataLines.length; i++) {
        const rowNum = i + 2 // 1-indexed, +1 for header
        const line = dataLines[i]
        const fields = parseCsvLine(line)

        // Ensure we have enough columns
        const maxIdx = Math.max(...Object.values(colIdx))
        if (fields.length <= maxIdx) {
            errors.push({
                row: rowNum,
                message: `Fila incompleta: se esperaban al menos ${maxIdx + 1} columnas, se encontraron ${fields.length}.`,
            })
            continue
        }

        const rawDayType = (fields[colIdx['day_type']] || '').trim()
        const rawMealName = (fields[colIdx['meal_name']] || '').trim()
        const rawOptionName = (fields[colIdx['option_name']] || '').trim()
        const rawAmount = (fields[colIdx['amount']] || '').trim()
        const rawUnit = (fields[colIdx['unit']] || '').trim()
        const rawFoodName = (fields[colIdx['food_name']] || '').trim()

        // Validate required non-empty (error messages in Spanish)
        const rowErrors: string[] = []
        if (!rawDayType) rowErrors.push('"Tipo de día" no puede estar vacío')
        if (!rawMealName) rowErrors.push('"Nombre de la comida" no puede estar vacío')
        if (!rawOptionName) rowErrors.push('"Nombre de la opción" no puede estar vacío')
        if (!rawFoodName) rowErrors.push('"Nombre del alimento" no puede estar vacío')
        if (!rawUnit) rowErrors.push('"Unidad" no puede estar vacía')

        // Validate amount
        const amount = parseFloat(rawAmount)
        if (!rawAmount || isNaN(amount)) {
            rowErrors.push(`"Cantidad" debe ser un número (se encontró: "${rawAmount}")`)
        }

        if (rowErrors.length > 0) {
            for (const msg of rowErrors) {
                errors.push({ row: rowNum, message: msg })
            }
            continue
        }

        // Normalize day_type
        const normalized = normalizeDayType(rawDayType)
        if (!normalized) {
            errors.push({
                row: rowNum,
                column: 'Tipo de día',
                message: `Tipo de día no reconocido: "${rawDayType}". Valores aceptados: Entreno, Descanso, Normal, Doble sesión.`,
            })
            continue
        }

        // Warning for doble_sesion
        if (DOUBLE_SESSION_SYNONYMS.has(rawDayType.toLowerCase())) {
            warnings.push({
                row: rowNum,
                message: `"${rawDayType}" no existe en el sistema. Se ha mapeado a "Entreno" (training).`,
            })
        }

        parsedRows.push({
            rowNum,
            dayType: normalized,
            mealName: rawMealName,
            optionName: rawOptionName,
            amount,
            unit: rawUnit,
            foodName: rawFoodName,
        })
    }

    // If there were any row errors, stop and report
    if (errors.length > 0) {
        return { ok: false, errors, warnings }
    }

    // ---- 4. Assemble structure ------------------------------------------------
    // We use ordered Maps to preserve insertion order (== CSV order)

    // dayType → mealName → optionName → items[]
    const structure = new Map<DayType, Map<string, Map<string, DietOptionItemInput[]>>>()
    // Track order of insertion
    const dayTypeOrder: DayType[] = []
    const mealOrder = new Map<DayType, string[]>()
    const optionOrder = new Map<string, string[]>() // key = `${dayType}||${mealName}`

    for (const row of parsedRows) {
        // Day type
        if (!structure.has(row.dayType)) {
            structure.set(row.dayType, new Map())
            dayTypeOrder.push(row.dayType)
            mealOrder.set(row.dayType, [])
        }
        const dayMap = structure.get(row.dayType)!

        // Meal
        if (!dayMap.has(row.mealName)) {
            dayMap.set(row.mealName, new Map())
            mealOrder.get(row.dayType)!.push(row.mealName)
        }
        const mealMap = dayMap.get(row.mealName)!

        // Option
        const optKey = `${row.dayType}||${row.mealName}`
        if (!mealMap.has(row.optionName)) {
            mealMap.set(row.optionName, [])
            if (!optionOrder.has(optKey)) optionOrder.set(optKey, [])
            optionOrder.get(optKey)!.push(row.optionName)
        }

        // Item
        const items = mealMap.get(row.optionName)!
        items.push({
            item_type: 'food',
            name: row.foodName,
            quantity_value: row.amount,
            quantity_unit: row.unit,
            notes: '',
            order_index: items.length,
        })
    }

    // ---- 5. Build DietMealInput[] --------------------------------------------
    const meals: DietMealInput[] = []

    let totalDayTypes = 0
    let totalMeals = 0
    let totalOptions = 0
    let totalItems = 0

    for (const dayType of dayTypeOrder) {
        totalDayTypes++
        const dayMap = structure.get(dayType)!
        const orderedMeals = mealOrder.get(dayType) || []

        for (let mealIdx = 0; mealIdx < orderedMeals.length; mealIdx++) {
            const mealName = orderedMeals[mealIdx]
            totalMeals++
            const mealMap = dayMap.get(mealName)!
            const optKey = `${dayType}||${mealName}`
            const orderedOptions = optionOrder.get(optKey) || []

            const options: DietMealOptionInput[] = []
            for (let optIdx = 0; optIdx < orderedOptions.length; optIdx++) {
                const optName = orderedOptions[optIdx]
                const items = mealMap.get(optName)!
                totalOptions++
                totalItems += items.length
                options.push({
                    name: optName,
                    order_index: optIdx,
                    notes: '',
                    items,
                })
            }

            meals.push({
                day_type: dayType,
                name: mealName,
                order_index: mealIdx,
                options,
            })
        }
    }

    return {
        ok: true,
        meals,
        stats: {
            totalRows: parsedRows.length,
            dayTypes: totalDayTypes,
            meals: totalMeals,
            options: totalOptions,
            items: totalItems,
        },
        warnings,
    }
}

// ============================================================================
// CSV TEMPLATE GENERATOR
// ============================================================================

/**
 * Generates a sample CSV template string suitable as a download.
 * Uses Spanish headers so the file is user-friendly for coaches.
 */
export function generateCsvTemplate(): string {
    const rows = [
        'Tipo de día,Nombre de la comida,Nombre de la opción,Cantidad,Unidad,Nombre del alimento',
        'Entreno,Desayuno,Opción 1,80,g,Avena',
        'Entreno,Desayuno,Opción 1,250,ml,Leche desnatada',
        'Entreno,Desayuno,Opción 2,2,ud,Huevos',
        'Entreno,Desayuno,Opción 2,60,g,Pan integral',
        'Entreno,Almuerzo,Opción 1,150,g,Pollo a la plancha',
        'Entreno,Almuerzo,Opción 1,200,g,Patata cocida',
        'Descanso,Comida,Opción 1,200,g,Patata',
        'Descanso,Comida,Opción 1,180,g,Merluza al horno',
        'Descanso,Cena,Opción 1,100,g,Pan integral',
        'Descanso,Cena,Opción 1,150,g,Pavo en lonchas',
        'Normal,Desayuno,Opción 1,40,g,Copos de avena',
        'Normal,Desayuno,Opción 1,200,ml,Leche desnatada',
        'Doble sesión,Merienda,Opción 1,30,g,Frutos secos',
    ]
    return rows.join('\n')
}

/**
 * Triggers a browser download of the CSV template.
 */
export function downloadCsvTemplate(): void {
    const content = generateCsvTemplate()
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_dieta_opciones.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

/**
 * Validate that a File object is a valid CSV candidate before reading.
 */
export function validateCsvFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        return 'Solo se admiten archivos .csv'
    }
    if (file.size === 0) {
        return 'El archivo está vacío'
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return `El archivo es demasiado grande (máximo 2 MB). Tamaño actual: ${(file.size / 1024 / 1024).toFixed(1)} MB`
    }
    return null
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Parses a single CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current)
            current = ''
        } else {
            current += ch
        }
    }

    fields.push(current)
    return fields
}

/**
 * Normalizes a raw day_type string to DayType or null if not recognized.
 */
function normalizeDayType(raw: string): DayType | null {
    const lower = raw.toLowerCase().trim()

    // Direct map lookup
    if (lower in DAY_TYPE_MAP) {
        return DAY_TYPE_MAP[lower]
    }

    // Double session synonyms → training
    if (DOUBLE_SESSION_SYNONYMS.has(lower)) {
        return 'training'
    }

    // Also handle Spanish accented versions
    const normalized = lower
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')

    if (normalized in DAY_TYPE_MAP) {
        return DAY_TYPE_MAP[normalized]
    }

    return null
}
