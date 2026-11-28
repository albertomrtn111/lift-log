/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // La app no usa next/image. Con el optimizador apagado, /_next/image responde
    // 404 sin descargar ni procesar ninguna imagen (cierra sus avisos de seguridad).
    images: {
        unoptimized: true,
    },
    experimental: {
        // Las páginas dinámicas no se reutilizan de la caché del navegador al
        // navegar (por defecto 30 s): volver a una pantalla muestra datos al día.
        staleTimes: {
            dynamic: 0,
        },
    },
    // Ninguna URL de la app debe indexarse (tampoco redirecciones, imágenes ni PDFs):
    // en Google solo debe aparecer la web comercial.
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
            },
        ]
    },
}

export default nextConfig
