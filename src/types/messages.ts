export interface Message {
    id: string
    coach_id: string
    client_id: string
    sender_role: 'coach' | 'client'
    sender_id: string
    content: string
    read_at: string | null
    created_at: string
}
