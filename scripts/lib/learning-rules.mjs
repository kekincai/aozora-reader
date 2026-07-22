const HIRAGANA_ONLY = /^[ぁ-ゖー]+$/
const KATAKANA_ONLY = /^[ァ-ヺー]+$/
const JAPANESE_WORD = /^[ぁ-ゖァ-ヺ一-龯々〆ヵヶー]+$/
const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞'])
const unsafeExact = new Set(['し', 'と', 'さん', 'いく', 'がる', 'ぐらい', 'くらい', 'けれど', 'たった', 'なんか', 'まで', 'ただ', 'なら', 'たら', 'とも', 'なり'])

export const hiragana = (value = '') => value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))

export function kanaKey(reading = '') {
  const first = hiragana(reading.normalize('NFKC'))[0] || '他'
  const groups = [
    ['か', 'が'], ['き', 'ぎ'], ['く', 'ぐ'], ['け', 'げ'], ['こ', 'ご'],
    ['さ', 'ざ'], ['し', 'じ'], ['す', 'ず'], ['せ', 'ぜ'], ['そ', 'ぞ'],
    ['た', 'だ'], ['ち', 'ぢ'], ['つ', 'づ'], ['て', 'で'], ['と', 'ど'],
    ['は', 'ばぱ'], ['ひ', 'びぴ'], ['ふ', 'ぶぷ'], ['へ', 'べぺ'], ['ほ', 'ぼぽ'],
  ]
  return groups.find(([, variants]) => variants.includes(first))?.[0] || (/[ぁ-ん]/.test(first) ? first : '他')
}

export function vocabularyCategory(token) {
  if (!token) return '其他'
  if (KATAKANA_ONLY.test(token.surface_form || '')) return '外来语'
  if (token.pos === '名詞') return '名词'
  if (token.pos === '動詞') return '动词'
  if (token.pos === '形容詞') return '形容词'
  if (token.pos === '副詞') return '副词'
  if (token.pos === '接続詞' || token.pos === '連体詞') return '接续・连体'
  return '其他'
}

export function annotationSafety(term, token) {
  const normalized = term.normalize('NFKC').trim()
  if (!normalized || unsafeExact.has(normalized)) return { safe: false, reason: '容易与常用功能词混淆' }
  if (!JAPANESE_WORD.test(normalized)) return { safe: false, reason: '含有词典记号或多个变体' }
  if (!token || !CONTENT_POS.has(token.pos)) return { safe: false, reason: '不是可明确识别的内容词' }
  if (['接尾', '接頭', '非自立'].includes(token.pos_detail_1)) return { safe: false, reason: '词缀或非独立词' }
  if (HIRAGANA_ONLY.test(normalized) && Array.from(normalized).length <= 3) return { safe: false, reason: '短假名容易误判' }
  if (KATAKANA_ONLY.test(normalized) && Array.from(normalized).length < 3) return { safe: false, reason: '短片假名容易误判' }
  return { safe: true, reason: '' }
}

export function canAnnotateToken(entry, token) {
  if (!entry?.annotationSafe || !token) return false
  if (!CONTENT_POS.has(token.pos)) return false
  if (['接尾', '接頭', '非自立'].includes(token.pos_detail_1)) return false
  const base = (token.basic_form === '*' ? token.surface_form : token.basic_form).normalize('NFKC')
  const surface = token.surface_form.normalize('NFKC')
  return entry.term === base || entry.term === surface
}
