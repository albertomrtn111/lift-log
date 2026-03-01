export function getDefaultTrainingColumns() {
    return [
        { key: 'exercise', label: 'Ejercicio', data_type: 'text', scope: 'exercise', editable_by: 'coach', order_index: 1 },
        { key: 'sets', label: 'Series', data_type: 'number', scope: 'week', editable_by: 'coach', order_index: 2 },
        { key: 'reps', label: 'Reps', data_type: 'text', scope: 'week', editable_by: 'coach', order_index: 3 },
        { key: 'rir', label: 'RIR', data_type: 'text', scope: 'week', editable_by: 'coach', order_index: 4 },
        { key: 'rest', label: 'Descanso', data_type: 'text', scope: 'week', editable_by: 'coach', order_index: 5 },
        { key: 'tips', label: 'Tips', data_type: 'text', scope: 'week', editable_by: 'coach', order_index: 6 },
        { key: 'weight', label: 'Peso', data_type: 'number', scope: 'week', editable_by: 'client', order_index: 7 },
        { key: 'reps_done', label: 'Reps hechas', data_type: 'number', scope: 'week', editable_by: 'client', order_index: 8 },
        { key: 'notes', label: 'Notas', data_type: 'text', scope: 'week', editable_by: 'both', order_index: 9 },
    ]
}
