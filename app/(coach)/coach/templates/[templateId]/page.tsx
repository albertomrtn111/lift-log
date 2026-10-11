import { getTemplateById } from '../actions'
import { notFound } from 'next/navigation'
import { StrengthTemplateEditor } from '@/components/coach/templates/StrengthTemplateEditor'
import { CardioSessionBuilder } from '@/components/coach/templates/CardioSessionBuilder'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'

interface TemplateEditorPageProps {
    params: {
        templateId: string
    }
}

export default async function TemplateEditorPage({ params }: TemplateEditorPageProps) {
    const template = await getTemplateById(params.templateId)

    if (!template) {
        notFound()
    }

    return (
        <div className="min-h-screen pb-20 lg:pb-4 flex flex-col">
            <CoachPageHeader
                eyebrow={template.type === 'cardio' ? 'Plantilla de cardio' : 'Plantilla de fuerza'}
                title={template.name}
                backHref="/coach/templates"
            />

            <main className="flex-1 px-4 py-4 lg:px-8 lg:py-6">
                {template.type === 'cardio' ? (
                    <CardioSessionBuilder template={template} />
                ) : (
                    <StrengthTemplateEditor template={template} />
                )}
            </main>
        </div>
    )
}
