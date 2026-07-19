import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as cheerio from 'cheerio'

const sourceRoot = process.env.AOZORA_ROOT || '/Volumes/minipc-1/git/aozorabunko'
const outputRoot = resolve('public/corpus')

const selections = [
  ['637', '手袋を買いに', '新美 南吉', '000121/files/637_13341.html', 'N2', '童話', 8, '雪の夜、子狐は初めて人間の町へ。やさしさと怖さが同居する短篇。'],
  ['92', '蜘蛛の糸', '芥川 竜之介', '000879/files/92_14545.html', 'N2', '短篇', 7, '極楽と地獄を一本の糸が結ぶ、緊張感のある掌篇。'],
  ['628', 'ごん狐', '新美 南吉', '000121/files/628_14895.html', 'N2', '童話', 12, 'いたずら狐のごんと兵十。心情の変化を追いやすい作品。'],
  ['43754', '注文の多い料理店', '宮沢 賢治', '000081/files/43754_17659.html', 'N2', '幻想', 14, '二人の紳士が入った、不思議な西洋料理店の話。'],
  ['211', '一房の葡萄', '有島 武郎', '000025/files/211_20472.html', 'N2', '随筆的短篇', 14, '少年時代の罪悪感と先生の静かなやさしさ。'],
  ['1567', '走れメロス', '太宰 治', '000035/files/1567_14913.html', 'N2+', '短篇', 22, '友情と信頼をめぐる力強い文章。前半を学習片として収録。'],
  ['2363', '茶わんの湯', '寺田 寅彦', '000042/files/2363_13807.html', 'N2+', '随筆', 9, '身近な茶わんから科学的な見方を学ぶ短い随筆。'],
  ['799', '夢十夜', '夏目 漱石', '000148/files/799_14972.html', 'N1', '幻想', 11, '十の夢から第一夜を選んで読む。象徴的な表現の入口に。'],
  ['624', '山月記', '中島 敦', '000119/files/624_14544.html', 'N1', '短篇', 24, '漢語の密度が高い名篇。冒頭を精読する上級向け。'],
  ['45245', '高瀬舟', '森 鴎外', '000129/files/45245_22007.html', 'N1', '短篇', 28, '倫理と幸福を問い直す作品。場面ごとに区切って読む。'],
]

function normalize(html) {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a[^>]*>|<\/a>/gi, '')
    .replace(/\sclass="[^"]*"/gi, '')
    .trim()
}

async function importWork([id, title, author, relativePath, level, genre, minutes, summary]) {
  const path = resolve(sourceRoot, 'cards', relativePath)
  const bytes = await readFile(path)
  const source = new TextDecoder('shift_jis').decode(bytes)
  const $ = cheerio.load(source)
  const main = $('.main_text').first()
  main.find('script, style').remove()

  const paragraphs = main
    .html()
    ?.split(/<br\s*\/?>\s*<br\s*\/?>/i)
    .map((item) => normalize(item.replace(/<br\s*\/?>/gi, ' ')))
    .filter((item) => cheerio.load(item).text().trim().length > 0) ?? []

  const work = {
    id,
    title,
    author,
    level,
    genre,
    minutes,
    summary,
    sourcePath: `cards/${relativePath}`,
    sourceUrl: `https://www.aozora.gr.jp/cards/${relativePath}`,
    attribution: '青空文庫（著作権なし）',
    paragraphs,
  }

  await writeFile(resolve(outputRoot, 'works', `${id}.json`), `${JSON.stringify(work, null, 2)}\n`)
  return { ...work, paragraphs: undefined, paragraphCount: paragraphs.length }
}

await mkdir(resolve(outputRoot, 'works'), { recursive: true })
const works = []
for (const selection of selections) works.push(await importWork(selection))
await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), works }, null, 2)}\n`)
console.log(`Imported ${works.length} public-domain works from ${sourceRoot}`)
