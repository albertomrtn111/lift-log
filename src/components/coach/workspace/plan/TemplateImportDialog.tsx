'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2, Dumbbell, Tag } from 'lucide-react'
import { getTemplates } from '../../../../../app/(coach)/coach/templates/actions'
import { TrainingTemplate } from '@/types/templates'
import { useToast } from '@/hooks/use-toast'

interface TemplateImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (template: TrainingTemplate) => void
}

export function TemplateImportDialog({ open, onOpenChange, onSelect }: TemplateImportDialogProps) {
    const { toast } = useToast()
    const [templates, setTemplates] = useState<TrainingTemplate[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (open) {
            loadTemplates()
        }
    }, [open])

    async function loadTemplates() {
        setLoading(true)
        try {
            const data = await getTemplates('strength')
            setTemplates(data)
        } catch (error) {
            console.error('Error loading templates:', error)
            toast({
                title: 'Error',
                description: 'No se pudieron cargar las plantillas.',
                variant: 'destructive',
            })
        } finally {
            setLoading(false)
        }
    }

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Importar Plantilla de Fuerza</DialogTitle>
                </DialogHeader>

                <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre o etiqueta..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {search ? 'No se encontraron plantillas.' : 'No tienes plantillas de fuerza guardadas.'}
                        </div>
                    ) : (
                        filteredTemplates.map((template) => (
                            <div
                                key={template.id}
                                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                                onClick={() => {
                                    onSelect(template)
                                    onOpenChange(false)
                                }}
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Dumbbell className="h-4 w-4 text-primary" />
                                        <h4 className="font-semibold">{template.name}</h4>
                                    </div>
                                    {template.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-1">{template.description}</p>
                                    )}
                                    {template.tags && template.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {template.tags.map(tag => (
                                                <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                                                    <Tag className="h-3 w-3 mr-1" />
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100">
                                    Seleccionar
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
