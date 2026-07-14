export type MessageAttachmentType = 'document' | 'audio' | 'image'

export interface MessageAttachment {
    type: MessageAttachmentType
    /** Ruta dentro del bucket chat-media ({coach_id}/{client_id}/{archivo}) */
    url: string
    name: string
    size: number
    mime: string
    /** Duración en segundos (solo audio) */
    duration?: number | null
}

export interface Message {
    id: string
    coach_id: string
    client_id: string
    sender_role: 'coach' | 'client'
    sender_id: string
    content: string
    message_type: 'chat' | 'review_feedback'
    read_at: string | null
    created_at: string
    attachment_type?: MessageAttachmentType | null
    attachment_url?: string | null
    attachment_name?: string | null
    attachment_size?: number | null
    attachment_mime?: string | null
    attachment_duration?: number | null
}
