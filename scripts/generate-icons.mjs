import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const inputPath = join(__dirname, '../public/Logo_nexttrain.png')
const outputDir = join(__dirname, '../public/icons')

mkdirSync(outputDir, { recursive: true })

const sizes = [
    { name: 'icon-72x72.png',   size: 72 },
    { name: 'icon-96x96.png',   size: 96 },
    { name: 'icon-128x128.png', size: 128 },
    { name: 'icon-144x144.png', size: 144 },
    { name: 'icon-152x152.png', size: 152 },
    { name: 'icon-180x180.png', size: 180 },    // Apple Touch Icon
    { name: 'icon-192x192.png', size: 192 },    // Android PWA / SW badge base
    { name: 'icon-384x384.png', size: 384 },
    { name: 'icon-512x512.png', size: 512 },    // Android splash / maskable
    { name: 'badge-72x72.png',  size: 72 },     // Push notification badge
]

for (const { name, size } of sizes) {
    await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(join(outputDir, name))
    console.log(`✓ Generated ${name}`)
}

console.log('All icons generated in /public/icons/')
