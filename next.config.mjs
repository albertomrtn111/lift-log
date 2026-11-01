/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        // Las páginas dinámicas no se reutilizan de la caché del navegador al
        // navegar (por defecto 30 s): volver a una pantalla muestra datos al día.
        staleTimes: {
            dynamic: 0,
        },
    },
}

export default nextConfig
