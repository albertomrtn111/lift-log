import 'server-only'

import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Cloudflare R2 (API compatible con S3). Solo se usa desde el servidor: las
 * credenciales nunca llegan al navegador y todas las peticiones a R2 salen de la
 * IP del servidor (salvo `R2_PRIVATE_DELIVERY=redirect`, ver más abajo).
 *
 * Variables:
 * - R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * - R2_BUCKET: bucket con acceso público (fotos de perfil), servido en R2_PUBLIC_URL
 * - R2_PRIVATE_BUCKET: bucket SIN acceso público (check-ins y chat). Si falta, las
 *   fotos privadas se siguen guardando en Supabase Storage.
 * - R2_PRIVATE_DELIVERY: 'proxy' (por defecto: el servidor lee de R2 y entrega el
 *   archivo) o 'redirect' (redirige a una URL firmada de 5 min; el navegador lee
 *   directamente de R2, lo que no funciona si el token está filtrado por IP).
 */

let client: S3Client | null = null

function env(name: string): string | null {
    const value = process.env[name]?.trim()
    return value ? value : null
}

function getClient(): S3Client {
    if (client) return client
    const endpoint = env('R2_ENDPOINT')
    const accessKeyId = env('R2_ACCESS_KEY_ID')
    const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('[r2] Faltan R2_ENDPOINT, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY')
    }
    client = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
    return client
}

function hasCredentials(): boolean {
    return !!(env('R2_ENDPOINT') && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY'))
}

/** Bucket público para avatares, o null si R2 no está configurado. */
export function publicBucket(): { bucket: string; publicUrl: string } | null {
    const bucket = env('R2_BUCKET')
    const publicUrl = env('R2_PUBLIC_URL')
    if (!hasCredentials() || !bucket || !publicUrl) return null
    return { bucket, publicUrl: publicUrl.replace(/\/+$/, '') }
}

/**
 * Bucket privado, o null si no está configurado. Nunca puede ser el mismo que el
 * público: R2 publica el bucket entero, así que las fotos privadas quedarían a la vista.
 */
export function privateBucket(): string | null {
    const bucket = env('R2_PRIVATE_BUCKET')
    if (!hasCredentials() || !bucket) return null
    if (bucket === env('R2_BUCKET')) {
        console.error('[r2] R2_PRIVATE_BUCKET no puede ser el bucket público; las fotos privadas siguen en Supabase')
        return null
    }
    return bucket
}

export function privateDeliveryMode(): 'proxy' | 'redirect' {
    return env('R2_PRIVATE_DELIVERY') === 'redirect' ? 'redirect' : 'proxy'
}

export async function putObject(bucket: string, key: string, body: Uint8Array, contentType: string) {
    await getClient().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Las claves no se reutilizan: cada subida tiene un nombre nuevo
        CacheControl: 'public, max-age=31536000, immutable',
    }))
}

/** `range` es la cabecera Range del navegador: los vídeos se piden a trozos. */
export async function getObject(bucket: string, key: string, range?: string) {
    return getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }))
}

export async function deleteObject(bucket: string, key: string) {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/** URL firmada de lectura de corta duración. */
export async function presignGet(bucket: string, key: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}
