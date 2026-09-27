import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findLowerLevelEntries, loadLowerLevelLists } from './lib/lower-level.mjs'

// Marks N2/N1 lexicon entries that are really N5–N3 words so they are no longer annotated.
// Keeps generatedAt, so the analysis version (and the minipc import) is unaffected.
const path = resolve('data/lexicon/index.json')
const index = JSON.parse(await readFile(path, 'utf8'))
const lower = findLowerLevelEntries(index.vocabulary, await loadLowerLevelLists())
for (const entry of index.vocabulary) {
  const level = lower.get(entry.id)
  if (level) Object.assign(entry, { lowerLevel: level, annotationSafe: false, annotationNote: `${level}の基本語（別表記）` })
  else delete entry.lowerLevel
}
await writeFile(path, `${JSON.stringify(index, null, 2)}\n`)
console.log(`Marked ${lower.size} entries as lower-level words`)
