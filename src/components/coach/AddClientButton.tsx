'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2, Send, Save } from 'lucide-react'
import { createClientAction } from './actions'
import { sendInviteAction } from './invite-actions'
import { useToast } from '@/hooks/use-toast'

interface AddClientButtonProps {
    coachId: string
}

export function AddClientButton({ coachId }: AddClientButtonProps) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const { toast } = useToast()

    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        start_date: new Date().toISOString().split('T')[0],
        checkin_frequency_days: 14,
    })

    const resetForm = () => {
        setFormData({
            full_name: '',
            email: '',
            phone: '',
            start_date: new Date().toISOString().split('T')[0],
            checkin_frequency_days: 14,
        })
        setError(null)
    }

    const handleSubmit = (sendInvite: boolean) => {
        setError(null)

        startTransition(async () => {
            // 1. Create client
            const result = await createClientAction({
                coach_id: coachId,
                ...formData,
                phone: formData.phone || undefined,
            })

            if (!result.success || !result.client) {
                console.error('Error creating client:', {
                    error: result.error,
                    details: result.details,
                })
                const errorMessage = result.details
                    ? `${result.error}\n${result.details}`
                    : result.error || 'Error al crear el cliente'
                setError(errorMessage)
                return
            }

            // 2. Send invite if requested
            if (sendInvite) {
                const inviteResult = await sendInviteAction(result.client.id, coachId)

                if (inviteResult.success) {
                    toast({
                        title: 'Invite sent ✓',
                        description: `Invitation sent to ${result.client.email}`,
                    })
                } else {
                    toast({
                        title: 'Client created, but invite failed',
                        description: inviteResult.error || 'Could not send invitation email',
                        variant: 'destructive',
                    })
                }
            } else {
                toast({
                    title: 'Client created',
                    description: `${result.client.full_name} saved without invitation`,
                })
            }

            setOpen(false)
            resetForm()
            router.refresh()
        })
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Client</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add new client</DialogTitle>
                    <DialogDescription>
                        Create a client and send them an invitation to sign up.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(true) }} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="full_name">Full name *</Label>
                        <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="Juan Pérez"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="juan@ejemplo.com"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+34 600 000 000"
                            disabled={isPending}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start_date">Start date</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                required
                                disabled={isPending}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="frequency">Check-in (days)</Label>
                            <Input
                                id="frequency"
                                type="number"
                                min={7}
                                max={30}
                                value={formData.checkin_frequency_days}
                                onChange={(e) => setFormData({ ...formData, checkin_frequency_days: parseInt(e.target.value) || 14 })}
                                required
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                            {error}
                        </div>
                    )}

                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleSubmit(false)}
                            disabled={isPending}
                            className="gap-2"
                        >
                            <Save className="h-4 w-4" />
                            Save without invite
                        </Button>
                        <Button type="submit" disabled={isPending} className="gap-2">
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    Save & Send Invite
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
