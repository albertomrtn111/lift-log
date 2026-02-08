'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkin } from '@/types/coach'
import { Scale, Footprints, Moon, Target, FileText, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ReviewsTabProps {
    clientId: string
}

export function ReviewsTab({ clientId }: ReviewsTabProps) {
    const [checkins, setCheckins] = useState<Checkin[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadCheckins() {
            setLoading(true)
            const supabase = createClient()

            const { data } = await supabase
                .from('checkins')
                .select('*')
                .eq('client_id', clientId)
                .order('date', { ascending: false })
                .limit(10)

            setCheckins(data || [])
            setLoading(false)
        }

        loadCheckins()
    }, [clientId])

    if (loading) {
        return (
            <Card className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
        )
    }

    if (checkins.length === 0) {
        return (
            <Card className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">Sin check-ins</h3>
                <p className="text-sm text-muted-foreground">
                    Este cliente aún no ha registrado ningún check-in.
                </p>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            {/* Generate review button */}
            <Button className="w-full gap-2" variant="outline">
                <FileText className="h-4 w-4" />
                Generar borrador de review
            </Button>

            {/* Check-in history */}
            <div className="space-y-3">
                <h3 className="font-semibold">Últimos check-ins</h3>

                {checkins.map((checkin) => (
                    <Card key={checkin.id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">{checkin.date}</span>
                            {checkin.adherence_percent && (
                                <Badge variant={checkin.adherence_percent >= 80 ? 'default' : 'secondary'}>
                                    {checkin.adherence_percent}% adherencia
                                </Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                            {checkin.weight && (
                                <div className="flex items-center gap-2">
                                    <Scale className="h-4 w-4 text-primary" />
                                    <span>{checkin.weight} kg</span>
                                </div>
                            )}
                            {checkin.steps && (
                                <div className="flex items-center gap-2">
                                    <Footprints className="h-4 w-4 text-success" />
                                    <span>{checkin.steps.toLocaleString()}</span>
                                </div>
                            )}
                            {checkin.sleep_hours && (
                                <div className="flex items-center gap-2">
                                    <Moon className="h-4 w-4 text-primary" />
                                    <span>{checkin.sleep_hours}h</span>
                                </div>
                            )}
                        </div>

                        {checkin.notes && (
                            <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                                {checkin.notes}
                            </p>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    )
}
