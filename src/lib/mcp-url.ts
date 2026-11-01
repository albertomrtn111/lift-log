/**
 * URL pública del servidor MCP de NexTrain: la Edge Function `nexttrain-mcp`
 * del mismo proyecto de Supabase que usa la app.
 */
export const MCP_FUNCTION_PATH = '/functions/v1/nexttrain-mcp'

export function getMcpServerUrl(): string | null {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    if (!supabaseUrl) return null

    return `${supabaseUrl.replace(/\/$/, '')}${MCP_FUNCTION_PATH}`
}
