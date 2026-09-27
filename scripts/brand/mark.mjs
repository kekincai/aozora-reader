/**
 * The 青空しおり mark, drawn once with the Canvas 2D API so the same code paints a browser
 * <canvas> for previews and, through SvgContext, exports the SVG files the site ships.
 *
 * A bookmark (栞) with a notched tail, the kana し written as one white stroke that doubles
 * as the bookmark's cord, and a vermilion sun over it for 青空.
 */
export const BRAND = { ink: '#2f5a4d', sun: '#c2553b', paper: '#f6f4ee' }

/** Draws the mark into a 64×64 box. `ctx` is a CanvasRenderingContext2D or an SvgContext. */
export function drawMark(ctx, { background = null } = {}) {
  if (background) {
    ctx.fillStyle = background
    ctx.beginPath()
    ctx.roundRect(0, 0, 64, 64, 14)
    ctx.fill()
  }

  // Bookmark: rounded head, straight sides, a V cut into the tail.
  ctx.fillStyle = BRAND.ink
  ctx.beginPath()
  ctx.moveTo(17, 11)
  ctx.quadraticCurveTo(17, 5, 23, 5)
  ctx.lineTo(41, 5)
  ctx.quadraticCurveTo(47, 5, 47, 11)
  ctx.lineTo(47, 59)
  ctx.lineTo(32, 49)
  ctx.lineTo(17, 59)
  ctx.closePath()
  ctx.fill()

  // し: down, then a curl up to the right, like a cord slipping out of the page.
  ctx.strokeStyle = BRAND.paper
  ctx.lineWidth = 5.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(26.8, 14)
  ctx.bezierCurveTo(25.6, 21, 25, 28, 25.4, 33.5)
  ctx.bezierCurveTo(26.2, 43.5, 35.5, 45.5, 41.5, 33)
  ctx.stroke()

  // Sun, set like a seal in the upper right of the page.
  ctx.fillStyle = BRAND.sun
  ctx.beginPath()
  ctx.arc(38.5, 16.5, 4.6, 0, Math.PI * 2)
  ctx.fill()
}

const round = value => Number(value.toFixed(2))

/** Records Canvas 2D path calls and writes them out as SVG elements. */
export class SvgContext {
  constructor(width = 64, height = 64) {
    Object.assign(this, { width, height, elements: [], path: '', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' })
  }
  beginPath() { this.path = '' }
  moveTo(x, y) { this.path += `M${round(x)} ${round(y)}` }
  lineTo(x, y) { this.path += `L${round(x)} ${round(y)}` }
  quadraticCurveTo(cx, cy, x, y) { this.path += `Q${round(cx)} ${round(cy)} ${round(x)} ${round(y)}` }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { this.path += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(x)} ${round(y)}` }
  closePath() { this.path += 'Z' }
  arc(x, y, r, start, end) {
    // Full circles only, which is all the mark needs: two half arcs.
    if (Math.abs(end - start) < Math.PI * 2 - 1e-6) throw new Error('SvgContext.arc supports full circles only')
    this.path += `M${round(x - r)} ${round(y)}A${round(r)} ${round(r)} 0 1 0 ${round(x + r)} ${round(y)}A${round(r)} ${round(r)} 0 1 0 ${round(x - r)} ${round(y)}Z`
  }
  roundRect(x, y, w, h, r) {
    this.path += `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  }
  fill() { this.elements.push(`<path d="${this.path}" fill="${this.fillStyle}"/>`) }
  stroke() {
    this.elements.push(`<path d="${this.path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"/>`)
  }
  toSVG(title = '青空しおり') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label="${title}">\n  <title>${title}</title>\n  ${this.elements.join('\n  ')}\n</svg>\n`
  }
}
