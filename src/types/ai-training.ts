export interface AITrainingExerciseProposal {
    exercise_name: string
    muscle_group: string
    sets: number
    reps: string
    rir: string
    rest_seconds: number
    notes: string
}

export interface AITrainingDayProposal {
    name: string
    exercises: AITrainingExerciseProposal[]
}

export interface AITrainingProposal {
    name: string
    weeks: number
    days: AITrainingDayProposal[]
    explanation: string
    changes: string[]
}
