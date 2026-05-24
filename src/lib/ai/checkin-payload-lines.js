export function resolvePayloadLines(payload, metricDefs = [], formFields = []) {
    if (!payload) return ['Sin datos']

    const lines = []

    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === '') continue

        if (key.startsWith('metric_')) {
            const id = key.replace('metric_', '')
            const def = metricDefs.find((metric) => metric.id === id)
            const label = def ? `${def.name}${def.unit ? ` (${def.unit})` : ''}` : key
            lines.push(`- ${label}: ${value}`)
            continue
        }

        if (key.startsWith('campo_')) {
            const field = formFields.find((candidate) => candidate.id === key)
            const label = field?.label || key
            const renderedValue = Array.isArray(value) ? value.join(', ') : String(value)
            lines.push(`- ${label}: ${renderedValue}`)
        }
    }

    return lines.length > 0 ? lines : ['Sin datos']
}
