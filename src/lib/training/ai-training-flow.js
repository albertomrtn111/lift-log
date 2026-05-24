export function getAITrainingWizardConfig({ mode, activeProgramId }) {
    if (mode === 'modify' && activeProgramId) {
        return { programId: activeProgramId, step: 2 }
    }

    return { programId: null, step: 1 }
}
