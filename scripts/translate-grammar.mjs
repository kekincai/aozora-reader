import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const indexPath = resolve('public/learning/index.json')
const outputPath = resolve('data/grammar-zh.json')
const index = JSON.parse(await readFile(indexPath, 'utf8'))
const existing = await readFile(outputPath, 'utf8').then(JSON.parse).catch(() => ({}))
const batchSize = 20
const allowedKeys = new Set(index.grammar.map(entry => `${entry.level}:${entry.title}`))

for (const [key, translation] of Object.entries(existing)) {
  if (!allowedKeys.has(key)) {
    delete existing[key]
    continue
  }
  if (Array.isArray(translation.meaningZh)) translation.meaningZh = translation.meaningZh[0]
}
await mkdir(resolve('data'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`)

while (true) {
  const pending = index.grammar.filter(entry => !existing[`${entry.level}:${entry.title}`])
  if (!pending.length) break
  const batch = pending.slice(0, batchSize).map((entry, index) => ({
    index,
    key: `${entry.level}:${entry.title}`,
    pattern: entry.pattern,
    meaning: entry.meaning,
  }))
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      stream: false,
      format: 'json',
      options: { temperature: 0.1 },
      messages: [{
        role: 'user',
        content: `你是专业日语教师。把下面 JLPT 语法的 meaning 翻译成简洁、准确、自然的简体中文。meaningZh 用一句话说明语法功能，不得保留英文，不得增加学习建议。严格返回 JSON 对象：{"items":[{"index":0,"meaningZh":"中文"}]}。index 必须原样返回，必须返回全部输入项。\n\n${JSON.stringify(batch)}`,
      }],
    }),
  })
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
  const body = await response.json()
  const translated = JSON.parse(body.message.content)
  const before = Object.keys(existing).length
  for (const item of translated.items || []) {
    const source = batch[item.index]
    const meaningZh = Array.isArray(item.meaningZh) ? item.meaningZh[0] : item.meaningZh
    if (source && /[\u3400-\u9fff]/.test(meaningZh || '')) {
      existing[source.key] = { ...(existing[source.key] || {}), meaningZh }
    }
  }
  if (Object.keys(existing).length === before) throw new Error('Translation batch returned no matching items')
  await writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`)
  console.log(`Chinese grammar translations: ${Object.keys(existing).length} / ${index.grammar.length}`)
}

console.log(`Chinese grammar translations ready: ${Object.keys(existing).length}`)
