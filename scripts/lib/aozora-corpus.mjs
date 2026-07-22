import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'

export const PARSER_VERSION = 'aozora-postgres-v1'

const textDecoderLabels = new Map([
  ['shiftjis', 'shift_jis'],
  ['shift_jis', 'shift_jis'],
  ['sjis', 'shift_jis'],
  ['utf8', 'utf-8'],
  ['utf-8', 'utf-8'],
  ['euc-jp', 'euc-jp'],
])

const emptyToNull = value => value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim()
const integerOrNull = value => emptyToNull(value) === null ? null : Number.parseInt(value, 10)
const nonNegativeIntegerOrNull = value => {
  const number = integerOrNull(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}
const dateOrNull = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null
const codePointLength = value => Array.from(value || '').length

export function decodeAozoraBytes(bytes, declaredEncoding = '') {
  const compact = declaredEncoding.toLowerCase().replace(/[\s-]/g, '')
  const label = textDecoderLabels.get(compact) || textDecoderLabels.get(declaredEncoding.toLowerCase()) || 'shift_jis'
  return { source: new TextDecoder(label).decode(bytes), encoding: label }
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function repositoryPathFromUrl(url) {
  if (!url) return null
  try {
    const path = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '')
    if (!path.startsWith('cards/') || path.includes('..')) return null
    return path
  } catch {
    return null
  }
}

function ndcCodes(value) {
  return [...new Set((value || '').replace(/^NDC\s*/i, '').split(/[\s,、/]+/).map(item => item.trim()).filter(Boolean))]
}

function editionFromRow(row, workId, number) {
  const suffix = String(number)
  const edition = {
    workAozoraId: workId,
    source_number: number,
    edition_title: emptyToNull(row[`底本名${suffix}`]),
    publisher: emptyToNull(row[`底本出版社名${suffix}`]),
    first_published_text: emptyToNull(row[`底本初版発行年${suffix}`]),
    input_edition: emptyToNull(row[`入力に使用した版${suffix}`]),
    proofread_edition: emptyToNull(row[`校正に使用した版${suffix}`]),
    parent_edition_title: emptyToNull(row[`底本の親本名${suffix}`]),
    parent_publisher: emptyToNull(row[`底本の親本出版社名${suffix}`]),
    parent_first_published_text: emptyToNull(row[`底本の親本初版発行年${suffix}`]),
  }
  return Object.values(edition).some((value, index) => index > 1 && value !== null) ? edition : null
}

function fileFromRow(row, workId, format) {
  const html = format === 'html'
  const prefix = html ? 'XHTML/HTMLファイル' : 'テキストファイル'
  const sourceUrl = emptyToNull(row[`${prefix}URL`])
  if (!sourceUrl) return null
  return {
    workAozoraId: workId,
    format,
    source_url: sourceUrl,
    repository_path: repositoryPathFromUrl(sourceUrl),
    source_updated_on: dateOrNull(row[`${prefix}最終更新日`]),
    declared_encoding: emptyToNull(row[`${prefix}符号化方式`]),
    declared_charset: emptyToNull(row[`${prefix}文字集合`]),
    // The official catalog uses -1 as an unknown/not-applicable sentinel.
    revision_count: nonNegativeIntegerOrNull(row[`${prefix}修正回数`]),
  }
}

export function metadataRowsToRecords(rows) {
  const works = new Map()
  const people = new Map()
  const creditKeys = new Set()
  const credits = []
  const editionKeys = new Set()
  const editions = []
  const contributorKeys = new Set()
  const contributors = []
  const fileKeys = new Set()
  const files = []
  const roleOrdinals = new Map()

  for (const row of rows) {
    const workId = integerOrNull(row['作品ID'])
    if (!workId) continue
    const htmlFile = fileFromRow(row, workId, 'html')
    const textFile = fileFromRow(row, workId, 'text_zip')
    if (!works.has(workId)) {
      works.set(workId, {
        aozora_work_id: workId,
        title: emptyToNull(row['作品名']) || `作品 ${workId}`,
        title_reading: emptyToNull(row['作品名読み']),
        sort_reading: emptyToNull(row['ソート用読み']),
        subtitle: emptyToNull(row['副題']),
        subtitle_reading: emptyToNull(row['副題読み']),
        original_title: emptyToNull(row['原題']),
        first_appearance: emptyToNull(row['初出']),
        ndc_classifications: ndcCodes(row['分類番号']),
        orthography_type: emptyToNull(row['文字遣い種別']),
        copyright_status: emptyToNull(row['作品著作権フラグ']),
        published_on: dateOrNull(row['公開日']),
        metadata_updated_on: dateOrNull(row['最終更新日']),
        card_url: emptyToNull(row['図書カードURL']) || `https://www.aozora.gr.jp/cards/card${workId}.html`,
        has_text_file: Boolean(textFile),
        has_html_file: Boolean(htmlFile),
      })
    }

    const personId = integerOrNull(row['人物ID'])
    const role = emptyToNull(row['役割フラグ']) || '関係者'
    if (personId) {
      if (!people.has(personId)) {
        people.set(personId, {
          aozora_person_id: personId,
          family_name: emptyToNull(row['姓']),
          given_name: emptyToNull(row['名']),
          family_name_reading: emptyToNull(row['姓読み']),
          given_name_reading: emptyToNull(row['名読み']),
          family_name_sort: emptyToNull(row['姓読みソート用']),
          given_name_sort: emptyToNull(row['名読みソート用']),
          family_name_roman: emptyToNull(row['姓ローマ字']),
          given_name_roman: emptyToNull(row['名ローマ字']),
          birth_date: dateOrNull(row['生年月日']),
          death_date: dateOrNull(row['没年月日']),
          copyright_status: emptyToNull(row['人物著作権フラグ']),
        })
      }
      const key = `${workId}:${personId}:${role}`
      if (!creditKeys.has(key)) {
        const ordinalKey = `${workId}:${role}`
        const ordinal = (roleOrdinals.get(ordinalKey) || 0) + 1
        roleOrdinals.set(ordinalKey, ordinal)
        credits.push({ workAozoraId: workId, personAozoraId: personId, role, ordinal })
        creditKeys.add(key)
      }
    }

    for (const number of [1, 2]) {
      const edition = editionFromRow(row, workId, number)
      const key = `${workId}:${number}`
      if (edition && !editionKeys.has(key)) { editions.push(edition); editionKeys.add(key) }
    }
    for (const [field, contributorRole] of [['入力者', 'input'], ['校正者', 'proofreading']]) {
      const name = emptyToNull(row[field])
      const key = `${workId}:${contributorRole}:${name}`
      if (name && !contributorKeys.has(key)) {
        contributors.push({ workAozoraId: workId, role: contributorRole, name, ordinal: 1 })
        contributorKeys.add(key)
      }
    }
    for (const file of [textFile, htmlFile]) {
      if (!file) continue
      const key = `${workId}:${file.format}:${file.source_url}`
      if (!fileKeys.has(key)) { files.push(file); fileKeys.add(key) }
    }
  }

  return {
    works: [...works.values()],
    people: [...people.values()],
    credits,
    editions,
    contributors,
    files,
  }
}

function isHeadingNode(node) {
  if (node.type !== 'tag') return false
  const tag = (node.tagName || '').toLowerCase()
  const classes = String(node.attribs?.class || '')
  return /^h[1-6]$/.test(tag) || /(?:^|\s)[^\s]*midashi(?:\s|$)/.test(classes)
}

function splitMainText($, main) {
  const blocks = []
  let buffer = ''
  const flush = () => {
    const html = buffer.trim()
    if (html) blocks.push({ kind: 'paragraph', html })
    buffer = ''
  }
  for (const node of main.contents().toArray()) {
    if (isHeadingNode(node)) {
      flush()
      const tag = (node.tagName || '').toLowerCase()
      blocks.push({ kind: 'heading', level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : 3, html: $.html(node) })
      continue
    }
    if (node.type === 'tag' && (node.tagName || '').toLowerCase() === 'br') {
      flush()
      continue
    }
    if (node.type === 'text' && /^\s*$/.test(node.data || '')) continue
    buffer += node.type === 'text' ? (node.data || '') : $.html(node)
  }
  flush()
  return blocks
}

function cleanFragment(html) {
  const $ = cheerio.load(`<div id="aozora-fragment">${html}</div>`)
  const root = $('#aozora-fragment')
  root.find('script,style,iframe,object,embed').remove()
  root.find('a').each((_, element) => $(element).replaceWith($(element).contents()))
  root.find('img').each((_, element) => {
    const image = $(element)
    const display = image.attr('alt') || image.attr('title') || '※'
    const replacement = $('<span></span>').attr('data-gaiji', 'true').attr('data-source', image.attr('src') || '').text(display)
    image.replaceWith(replacement)
  })
  root.find('*').each((_, element) => {
    const tag = (element.tagName || '').toLowerCase()
    const keep = new Set(tag === 'span' ? ['data-gaiji', 'data-source'] : [])
    for (const attribute of Object.keys(element.attribs || {})) if (!keep.has(attribute)) $(element).removeAttr(attribute)
  })

  let plainText = ''
  const rubies = []
  const gaiji = []
  const append = value => { plainText += value.replace(/\r/g, '') }
  const walk = node => {
    if (node.type === 'text') { append(node.data || ''); return }
    if (node.type !== 'tag') return
    const tag = (node.tagName || '').toLowerCase()
    if (tag === 'rt' || tag === 'rp') return
    if (tag === 'br') { append('\n'); return }
    if (tag === 'ruby') {
      const ruby = $(node)
      const baseRuby = ruby.clone()
      baseRuby.find('rt,rp').remove()
      const base = baseRuby.text()
      const reading = ruby.find('rt').first().text().trim()
      const start = codePointLength(plainText)
      append(base)
      if (base && reading) rubies.push({ start_offset: start, end_offset: start + codePointLength(base), base_text: base, reading })
      return
    }
    if (tag === 'span' && $(node).attr('data-gaiji') === 'true') {
      const display = $(node).text() || '※'
      const start = codePointLength(plainText)
      append(display)
      gaiji.push({
        start_offset: start,
        end_offset: start + codePointLength(display),
        display_text: display,
        description: display,
        image_source: $(node).attr('data-source') || null,
      })
      return
    }
    for (const child of node.children || []) walk(child)
  }
  for (const node of root.contents().toArray()) walk(node)

  const leading = codePointLength(plainText) - codePointLength(plainText.trimStart())
  plainText = plainText.trim()
  for (const annotation of [...rubies, ...gaiji]) {
    annotation.start_offset = Math.max(0, annotation.start_offset - leading)
    annotation.end_offset = Math.max(annotation.start_offset, annotation.end_offset - leading)
  }
  return { html: root.html()?.trim() || '', plainText, rubies, gaiji }
}

export function extractAozoraDocument(source) {
  const $ = cheerio.load(source)
  const main = $('.main_text').first()
  if (!main.length) throw new Error('Missing .main_text')
  main.find('script,style').remove()
  const rawBodyHtml = main.html() || ''
  const blocks = splitMainText($, main)
  const chapters = [{ ordinal: 1, heading_level: null, title: null, title_reading: null, heading_html: null, plain_text: null, paragraphs: [] }]
  let current = chapters[0]
  for (const block of blocks) {
    const fragment = cleanFragment(block.html)
    if (!fragment.plainText) continue
    if (block.kind === 'heading') {
      if (current.paragraphs.length || current.title) {
        current = { ordinal: chapters.length + 1, heading_level: block.level, title: fragment.plainText, title_reading: null, heading_html: fragment.html, plain_text: fragment.plainText, paragraphs: [] }
        chapters.push(current)
      } else {
        Object.assign(current, { heading_level: block.level, title: fragment.plainText, heading_html: fragment.html, plain_text: fragment.plainText })
      }
      continue
    }
    current.paragraphs.push(fragment)
  }

  const paragraphs = []
  const rubies = []
  const gaiji = []
  for (const chapter of chapters) {
    chapter.character_count = chapter.paragraphs.reduce((sum, paragraph) => sum + codePointLength(paragraph.plainText), 0)
    chapter.paragraphs.forEach((paragraph, chapterIndex) => {
      const ordinal = paragraphs.length + 1
      paragraphs.push({ chapter_ordinal: chapter.ordinal, ordinal, chapter_paragraph_ordinal: chapterIndex + 1, html: paragraph.html, plain_text: paragraph.plainText, character_count: codePointLength(paragraph.plainText) })
      paragraph.rubies.forEach((ruby, index) => rubies.push({ paragraph_ordinal: ordinal, ordinal: index + 1, ...ruby }))
      paragraph.gaiji.forEach((item, index) => gaiji.push({ paragraph_ordinal: ordinal, ordinal: index + 1, ...item }))
    })
    delete chapter.paragraphs
  }
  const plainText = paragraphs.map(paragraph => paragraph.plain_text).join('\n\n')
  return {
    bodyHtml: cleanFragment(rawBodyHtml).html,
    plainText,
    chapters,
    paragraphs,
    rubies,
    gaiji,
    characterCount: codePointLength(plainText),
  }
}
