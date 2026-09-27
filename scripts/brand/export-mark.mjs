import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { BRAND, drawMark, SvgContext } from './mark.mjs'

// Regenerates every brand asset from drawMark(): run `node scripts/brand/export-mark.mjs`.
const svg = options => { const ctx = new SvgContext(); drawMark(ctx, options); return ctx.toSVG() }
const mark = svg()
const tile = svg({ background: BRAND.paper })

await writeFile(resolve('public/brand-mark.svg'), mark)
await writeFile(resolve('public/favicon.svg'), tile)

async function png(name, size, padding, source = mark) {
  const inner = Math.round(size * (1 - 2 * padding))
  const art = await sharp(Buffer.from(source), { density: 1200 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND.paper } })
    .composite([{ input: art, gravity: 'center' }]).png().toFile(resolve('public', name))
  console.log(name)
}
await png('icon-192.png', 192, 0.12)
await png('icon-512.png', 512, 0.12)
await png('apple-touch-icon.png', 180, 0.12)
await png('icon-maskable-512.png', 512, 0.22)
