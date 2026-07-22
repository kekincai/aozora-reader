import { describe, expect, it } from 'vitest'
import { extractAozoraDocument, metadataRowsToRecords, repositoryPathFromUrl } from './lib/aozora-corpus.mjs'

describe('complete Aozora PostgreSQL importer', () => {
  it('normalizes metadata without duplicating works or credits', () => {
    const base = {
      作品ID: '000637', 作品名: '手袋を買いに', 作品名読み: 'てぶくろをかいに', ソート用読み: 'てふくろをかいに',
      分類番号: 'NDC 913.6', 文字遣い種別: '新字新仮名', 作品著作権フラグ: 'なし', 公開日: '2000-01-01', 最終更新日: '2026-01-01',
      図書カードURL: 'https://www.aozora.gr.jp/cards/000121/card637.html', 人物ID: '000121', 姓: '新美', 名: '南吉', 役割フラグ: '著者',
      'XHTML/HTMLファイルURL': 'https://www.aozora.gr.jp/cards/000121/files/637_13341.html', 'XHTML/HTMLファイル符号化方式': 'ShiftJIS',
    }
    const records = metadataRowsToRecords([base, { ...base }])
    expect(records.works).toHaveLength(1)
    expect(records.people).toHaveLength(1)
    expect(records.credits).toHaveLength(1)
    expect(records.works[0].ndc_classifications).toEqual(['913.6'])
    expect(records.files[0].repository_path).toBe('cards/000121/files/637_13341.html')
  })

  it('extracts chapters, paragraphs, ruby and gaiji with stable offsets', () => {
    const source = `<html><body><div class="main_text">最初の段落。<br><br><h3 class="naka-midashi">第一章</h3><ruby>兵十<rt>ひょうじゅう</rt></ruby>が来た。<br><br><img class="gaiji" src="gaiji.png" alt="※"/>がある。</div></body></html>`
    const parsed = extractAozoraDocument(source)
    expect(parsed.chapters).toHaveLength(2)
    expect(parsed.paragraphs.map(paragraph => paragraph.plain_text)).toEqual(['最初の段落。', '兵十が来た。', '※がある。'])
    expect(parsed.rubies).toMatchObject([{ paragraph_ordinal: 2, start_offset: 0, end_offset: 2, base_text: '兵十', reading: 'ひょうじゅう' }])
    expect(parsed.gaiji).toMatchObject([{ paragraph_ordinal: 3, start_offset: 0, end_offset: 1, display_text: '※' }])
  })

  it('rejects repository paths outside the cards tree', () => {
    expect(repositoryPathFromUrl('https://www.aozora.gr.jp/cards/000001/files/1.html')).toBe('cards/000001/files/1.html')
    expect(repositoryPathFromUrl('https://example.com/other/file.html')).toBeNull()
  })

  it('treats the catalog revision sentinel as unknown', () => {
    const records = metadataRowsToRecords([{
      作品ID: '058324',
      作品名: 'revision sentinel',
      'テキストファイルURL': 'https://www.aozora.gr.jp/cards/001867/files/58324_ruby_66924.zip',
      'テキストファイル修正回数': '-1',
    }])
    expect(records.files[0].revision_count).toBeNull()
  })
})
