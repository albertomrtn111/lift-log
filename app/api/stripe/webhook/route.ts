import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/subscription/stripe'
import { syncStripeSubscription } from '@/lib/subscription/coach-subscription'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Webhook de Stripe Billing: mantiene coach_subscriptions al día.
 * Eventos a activar en Stripe: checkout.session.completed y customer.subscription.*
 */
export async function POST(req: Request) {
    const stripe = getStripe()
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!stripe || !secret) {
        return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 503 })
    }

    const signature = req.headers.get('stripe-signature')
    if (!signature) return NextResponse.json({ error: 'Falta la firma' }, { status: 400 })

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(await req.text(), signature, secret)
    } catch (error) {
        console.warn('[stripe] Firma de webhook no válida:', error instanceof Error ? error.message : error)
        return NextResponse.json({ error: 'Firma no válida' }, { status: 400 })
    }

    const subscriptionId = subscriptionIdOf(event)
    if (!subscriptionId) return NextResponse.json({ received: true })

    try {
        const coachId = await syncStripeSubscription(stripe, subscriptionId)
        console.log(`[stripe] ${event.type} → suscripción ${subscriptionId} (coach ${coachId ?? '-'})`)
    } catch (error) {
        // 500 para que Stripe lo reintente
        console.error(`[stripe] No se pudo sincronizar ${event.type} (${event.id}):`, error)
        return NextResponse.json({ error: 'No se pudo procesar' }, { status: 500 })
    }
    return NextResponse.json({ received: true })
}

function subscriptionIdOf(event: Stripe.Event): string | null {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        if (session.mode !== 'subscription' || !session.subscription) return null
        return typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    }
    if (event.type.startsWith('customer.subscription.')) {
        return (event.data.object as Stripe.Subscription).id
    }
    return null
}
