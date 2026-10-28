import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { writeFile } from 'node:fs/promises'
if (!GlobalFonts.registerFromPath('assets/fonts/bebas-neue-latin.woff2', 'Edenia Email')) throw new Error('Missing Edenia display font')
const scale = 4
const canvas = createCanvas(400, 144)
const context = canvas.getContext('2d')
context.font = `${28.8 * scale}px "Edenia Email"`
context.letterSpacing = `${28.8 * .08 * scale}px`
context.textBaseline = 'top'
context.fillStyle = '#050505'
context.fillText('EDENIA', 4, 4)
context.fillStyle = '#079cc8'
context.fillText('EDENIA', 0, 0)
await writeFile('images/email-wordmark.png', canvas.toBuffer('image/png'))
