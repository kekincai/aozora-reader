import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle, RotateCcw, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { trackEvent } from './operations'
import { Pagination } from './components/Pagination'
import { useTopicExamples } from './hooks/useTopicExamples'
import { topicExampleReaderLink, topicFocusText } from './reader-links'
import { chapters, families, practice, readings, relatedWorks, searchForms, topic, type TopicExampleCard } from './topics/giving-receiving'

const topicPageSize = 6

export function TopicsIndexPage() {
  useEffect(() => { document.title = '特集一覧 — 青空しおり' }, [])
  return <main className="page-frame topics-page" lang="zh-CN">
    <header className="page-head">
      <span className="page-kicker" lang="ja">特集</span>
      <h1>从一个问题出发，读懂日语的细部</h1>
      <p>每个特集围绕一个表达，先讲清规则，再到青空文库的原文里确认作家怎么用。</p>
    </header>
    <Link className="topic-card" to={`/topics/${topic.slug}`}>
      <span className="topic-card-mark" aria-hidden="true" lang="ja">授<i/>受</span>
      <div>
        <small>{topic.series} · {topic.keywords}</small>
        <h2><span lang="ja">{topic.name}</span>　{topic.title}</h2>
        <p>{topic.summary}</p>
        <span className="topic-card-meta">{chapters.length}章 · 原文用例检索 · 小测验</span>
      </div>
      <ArrowRight className="topic-card-arrow" size={18}/>
    </Link>
  </main>
}

function Highlight({ text, mark }: { text: string; mark?: string }) {
  if (!mark || !text.includes(mark)) return <>{text}</>
  const at = text.indexOf(mark)
  return <>{text.slice(0, at)}<mark>{mark}</mark>{text.slice(at + mark.length)}</>
}

function ExampleCard({ example }: { example: TopicExampleCard }) {
  return <article className="topic-example">
    <span className="topic-example-tag" lang="ja">{example.tag}</span>
    <p className="topic-example-jp" lang="ja"><Highlight text={example.jp} mark={example.mark}/></p>
    <p className="topic-example-note">{example.note}</p>
    {example.meta && <small>{example.meta}</small>}
  </article>
}

/** Highlights the chapter being read in the table of contents. */
function useActiveChapter() {
  const [active, setActive] = useState(chapters[0].id)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setActive(visible.target.id)
    }, { rootMargin: '-20% 0px -70% 0px' })
    chapters.forEach(chapter => { const element = document.getElementById(chapter.id); if (element) observer.observe(element) })
    return () => observer.disconnect()
  }, [])
  return active
}

function CorpusSearch() {
  const [form, setForm] = useState('all')
  const [query, setQuery] = useState('')
  const examples = useTopicExamples(form, query, topicPageSize)
  return <div className="topic-corpus">
    <h3>全库用例检索</h3>
    <p className="topic-muted">检索范围只包括青空文库中已入库的授受相关段落。结果是语言材料，不代表每一处都具有相同的恩惠含义。</p>
    <div className="catalog-chips" role="group" aria-label="形式">
      {searchForms.map(item => <button key={item.key} className={form === item.key ? 'is-on' : ''} aria-pressed={form === item.key} onClick={() => { setForm(item.key); examples.resetPage() }}>{item.label}</button>)}
    </div>
    <label className="study-search topic-corpus-search"><Search size={16}/>
      <input value={query} onChange={event => { setQuery(event.target.value); examples.resetPage() }} placeholder="追加词语，如：先生、母、許可" aria-label="追加词语"/>
      {query && <button onClick={() => { setQuery(''); examples.resetPage() }} aria-label="清除"><X size={16}/></button>}
    </label>
    {examples.loading ? <p className="topic-muted"><LoaderCircle className="spin" size={15}/> 正在查找原文…</p>
      : examples.error ? <p className="topic-muted">{examples.error}</p>
      : !examples.examples.length ? <p className="topic-muted">没有找到相符段落，请缩短追加词语或切换形式。</p>
      : <ol className="topic-corpus-list" start={(examples.page - 1) * topicPageSize + 1}>{examples.examples.map(item => <li key={`${item.id}-${item.ordinal}-${item.form}`}>
        <span className="topic-example-tag">{searchForms.find(entry => entry.key === item.form)?.label || item.form}</span>
        <blockquote lang="ja">{item.text}</blockquote>
        <Link to={topicExampleReaderLink(item.id, item.ordinal, item.form, topicFocusText(item.text, item.form))}>{item.author}『{item.title}』の該当箇所へ <ArrowRight size={13}/></Link>
      </li>)}</ol>}
    {!examples.loading && !examples.error && examples.examples.length > 0 && <Pagination page={examples.page} totalPages={examples.totalPages} totalItems={examples.total} label="青空文库用例分页"
      onPageChange={page => { examples.setPage(page); document.querySelector('.topic-corpus')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}/>}
  </div>
}

function Practice() {
  const [answer, setAnswer] = useState<string | null>(null)
  const choose = (value: string) => {
    setAnswer(value)
    trackEvent('learning_open', { path: '/topics/giving-receiving', label: `giving-receiving-quiz:${value}` })
  }
  const correct = answer === practice.answer
  return <div className="topic-practice">
    <h3>{practice.title}</h3>
    <p className="topic-muted">{practice.lead}</p>
    <p className="quiz-sentence" lang="ja">{practice.sentence[0]}<mark>{answer || '（　）'}</mark>{practice.sentence[1]}</p>
    <div className="daily-options">{practice.options.map(option => {
      const tone = !answer ? '' : option === practice.answer ? 'is-right' : option === answer ? 'is-wrong' : 'is-dim'
      return <button key={option} className={tone} disabled={Boolean(answer)} onClick={() => choose(option)} lang="ja">{option}</button>
    })}</div>
    {answer && <div className="topic-practice-result" role="status">
      <strong>{correct ? `正解：${practice.answer}` : `再看一次：${practice.answer}`}</strong>
      <p>{practice.explanation}</p>
      <button className="text-link" onClick={() => setAnswer(null)}><RotateCcw size={12}/> 再答一次</button>
    </div>}
  </div>
}

function ChapterBody({ chapter }: { chapter: typeof chapters[number] }): ReactNode {
  if (chapter.kind === 'families') return <div className="topic-families">{families.map(family => <article key={family.title}>
    <h3 lang="ja">{family.title}</h3><strong lang="ja">{family.words}</strong>
    <dl><div><dt>主语</dt><dd>{family.role}</dd></div><div><dt>方向</dt><dd>{family.direction}</dd></div></dl>
    <p>{family.note}</p>
  </article>)}</div>
  if (chapter.kind === 'readings') return <>
    <div className="topic-examples">{readings.map(item => <article className="topic-example" key={`${item.id}-${item.family}`}>
      <span className="topic-example-tag" lang="ja">{item.family} · {item.author}『{item.work}』</span>
      <p className="topic-example-jp" lang="ja">「{item.quote}」</p>
      <p className="topic-example-note">{item.analysis}</p>
      <Link className="topic-example-link" to={topicExampleReaderLink(item.id, item.ordinal, item.form, item.focusText)}>进入原文对应位置 <ArrowRight size={13}/></Link>
    </article>)}</div>
    <p className="topic-muted">引文依据本站收录的青空文库公开文本；省略处以“……”表示，没有改写成现代假名。</p>
    <CorpusSearch/>
  </>
  if (chapter.kind === 'practice') return <Practice/>
  return <>
    {chapter.pair && <div className="topic-pair">
      <ExampleCard example={chapter.pair[0]}/>
      <span className="topic-pair-same">同一件事</span>
      <ExampleCard example={chapter.pair[1]}/>
    </div>}
    {chapter.examples && <div className="topic-examples">{chapter.examples.map(example => <ExampleCard key={example.jp} example={example}/>)}</div>}
    {chapter.checklist && <ol className="topic-checklist" aria-label="检查顺序">{chapter.checklist.map(item => <li key={item}>{item}</li>)}</ol>}
    {chapter.aside && <aside className="topic-aside"><strong>{chapter.aside.title}</strong>{chapter.aside.jp && <p lang="ja">{chapter.aside.jp}</p>}<p>{chapter.aside.text}</p></aside>}
  </>
}

export function GivingReceivingTopicPage() {
  useEffect(() => { document.title = '授受動詞を原文から学ぶ — 青空しおり' }, [])
  const active = useActiveChapter()
  return <main className="topic-article" lang="zh-CN">
    <header className="topic-article-head">
      <Link className="topic-back" to="/topics"><ArrowLeft size={14}/> 特集一覧</Link>
      <span className="page-kicker">{topic.series} · <span lang="ja">{topic.name}</span></span>
      <h1>{topic.title}</h1>
      <p className="topic-lead">{topic.lead}</p>
      <ul className="topic-directions" aria-label="授受动词的三个方向">{topic.directions.map(item => <li key={item.verb}>
        <strong lang="ja">{item.verb}</strong><span>{item.from}</span><ArrowRight size={14}/><span>{item.to}</span>
      </li>)}</ul>
    </header>

    <div className="topic-layout">
      <nav className="topic-toc" aria-label="本特集目录">{chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`} className={active === chapter.id ? 'is-on' : ''} aria-current={active === chapter.id ? 'true' : undefined}>
        <b>{chapter.number}</b><span>{chapter.id === 'practice' ? '小试一题' : chapter.title}</span><em>{chapter.short}</em>
      </a>)}</nav>

      <div className="topic-body">
        {chapters.map(chapter => <section key={chapter.id} id={chapter.id} className="topic-chapter">
          <h2><b>{chapter.number}</b>{chapter.title}</h2>
          {chapter.lead && <p className="topic-chapter-lead">{chapter.lead}</p>}
          <ChapterBody chapter={chapter}/>
        </section>)}

        <section className="topic-chapter">
          <h2>继续在原文里观察</h2>
          <ul className="catalog-list">{relatedWorks.map(work => <li key={work.id} className="catalog-row">
            <Link className="catalog-main" to={`/read/${work.id}`}><strong lang="ja">{work.title}</strong><span className="catalog-author">{work.author}</span><span className="catalog-meta">{work.focus}</span></Link>
            <ArrowRight size={16} className="topic-card-arrow"/>
          </li>)}</ul>
        </section>
      </div>
    </div>
  </main>
}

