import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, LoaderCircle, RotateCcw, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { trackEvent } from './operations'
import { searchTopicExamples, type TopicExample } from './catalog'

const families = [
  { number: '01', title: 'あげる系', words: 'やる・あげる・差し上げる', role: '给予者作主语', direction: '我方／给予者 → 对方', note: '把施惠者的意志放在前景。「てあげる」有时会显得居高临下。' },
  { number: '02', title: 'くれる系', words: 'くれる・くださる', role: '给予者作主语', direction: '对方 → 我方', note: '动作朝说话者或心理上的“我方”而来，容易带出感谢、期待或失落。' },
  { number: '03', title: 'もらう系', words: 'もらう・いただく', role: '受益者作主语', direction: '我方 ← 对方', note: '把受益者取得帮助的过程放在前景，常暗含请求、许可或主动争取。' },
]

const readings = [
  { family: 'くれる', work: '坊っちゃん', author: '夏目 漱石', id: '752', quote: '折々は自分の小遣いで金鍔や紅梅焼を買ってくれる。寒い夜などは……枕元へ蕎麦湯を持って来てくれる。', analysis: '接连出现的「くれる」，不是简单罗列清做过什么，而是把一件件照顾都写成“流向我”的恩惠。读者因此从少年的视点体会清的亲近。' },
  { family: 'くれる', work: 'ごん狐', author: '新美 南吉', id: '628', quote: 'ごん、お前だったのか。いつも栗をくれたのは', analysis: '真相揭晓时用的是「くれた」。兵十终于把那些栗子理解成“为我而做”的好意；这个视点来得太迟，也让结尾格外悲凉。' },
  { family: 'もらう', work: '檸檬', author: '梶井 基次郎', id: '46349', quote: '蓄音器を聽かせて貰ひにわざわざ出かけて行つても……', analysis: '「貰ひに」把受益者放在中心，后面的「わざわざ出かけて」又显示他主动去取得这次体验。原文保留旧假名与旧字体。' },
  { family: 'やる', work: '注文の多い料理店', author: '宮沢 賢治', id: '43754', quote: '来た人を西洋料理にして、食べてやる家', analysis: '「てやる」并不天然等于善意。这里反而带着支配和恶意，说明授受形式表达的是说话者如何评价动作方向，而不是一律表示“帮忙”。' },
]

const relatedWorks = [
  { id: '752', title: '坊っちゃん', author: '夏目 漱石', focus: '反复出现的「くれる」' },
  { id: '628', title: 'ごん狐', author: '新美 南吉', focus: '结尾视点的翻转' },
  { id: '456', title: '銀河鉄道の夜', author: '宮沢 賢治', focus: '为母亲做事的「あげる」' },
  { id: '275', title: '女生徒', author: '太宰 治', focus: '心理性恩惠与「てやる」' },
]

export function TopicsIndexPage() {
  useEffect(() => { document.title = '特集一覧 — 青空しおり' }, [])
  return <main className="topics-index" lang="zh-CN">
    <section className="topics-index-hero"><p>特集 · TOKUSHŪ</p><h1>从一个问题出发，<br/>读懂日语的细部</h1><span>围绕一个主题，读懂日语中的表达、视点与文化。</span></section>
    <section className="topics-index-list">
      <header><h2 lang="ja">特集一覧</h2></header>
      <Link className="topic-cover" to="/topics/giving-receiving">
        <div><small>视点 · 恩惠 · 使役 · 转述</small><h3><span lang="ja">授受動詞</span><br/>谁的立场，看见了这份恩惠</h3><p>从「あげる・くれる・もらう」走到使役授受、第三者转述、请求与讽刺，再用青空文库全文用例检验自己的判断。</p></div>
        <div className="topic-cover-mark" aria-hidden="true"><b>授</b><i/><b>受</b></div>
        <span>进入特集 <ArrowRight size={16}/></span>
      </Link>
    </section>
  </main>
}

const searchForms = [
  { key: 'all', label: '全部授受' }, { key: 'kureru', label: 'てくれる系' }, { key: 'morau', label: 'てもらう系' },
  { key: 'ageru', label: 'てあげる・てやる系' }, { key: 'causative', label: '使役＋授受' },
]

const topicPageSize = 12

export function GivingReceivingTopicPage() {
  const [answer, setAnswer] = useState<string | null>(null)
  const [searchForm, setSearchForm] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [examples, setExamples] = useState<TopicExample[]>([])
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState('')
  const [examplePage, setExamplePage] = useState(0)
  const [exampleCursor, setExampleCursor] = useState<string>()
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMoreExamples, setHasMoreExamples] = useState(false)
  useEffect(() => { document.title = '授受動詞を原文から学ぶ — 青空しおり' }, [])
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchTopicExamples(searchForm, searchQuery, exampleCursor, topicPageSize).then(result => { if (active) { setExamples(result.examples); setNextCursor(result.page.nextCursor); setHasMoreExamples(result.page.hasMore); setSearchError('') } })
        .catch(error => { if (active) { setExamples([]); setNextCursor(null); setHasMoreExamples(false); setSearchError(error instanceof Error ? error.message : '用例を読み込めませんでした。') } })
        .finally(() => { if (active) setSearching(false) })
    }, searchQuery ? 300 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [searchForm, searchQuery, exampleCursor])
  const resetExampleSearch = () => {
    setExamplePage(0)
    setExampleCursor(undefined)
    setCursorHistory([undefined])
  }
  const showNextExamples = () => {
    if (!nextCursor) return
    setCursorHistory(history => [...history.slice(0, examplePage + 1), nextCursor])
    setExamplePage(page => page + 1)
    setExampleCursor(nextCursor)
  }
  const showPreviousExamples = () => {
    if (examplePage <= 0) return
    const previousPage = examplePage - 1
    setExamplePage(previousPage)
    setExampleCursor(cursorHistory[previousPage])
  }
  const choose = (value: string) => {
    setAnswer(value)
    trackEvent('learning_open', { path: '/topics/giving-receiving', label: `giving-receiving-quiz:${value}` })
  }
  const correct = answer === 'くれて'

  return <main className="topics-page" lang="zh-CN">
    <section className="topic-hero" id="viewpoint">
      <div className="topic-hero-main">
        <Link className="topic-back" to="/topics"><ArrowLeft size={13}/> 返回特集一览</Link>
        <p className="topic-series">特集一 · <span lang="ja">授受動詞</span></p>
        <h1>谁的立场，<br/>看见了这份<em>恩惠</em></h1>
        <p className="topic-lead">あげる・くれる・もらう不只是“给”和“收”。同一件事，因为说话者站的位置不同，日语会选择不同的动词。先看视点，再看动作。</p>
        <div className="topic-flow" aria-label="授受动词的三个方向">
          <div><small>我方／给予者</small><strong>あげる</strong></div><span><ArrowRight size={18}/></span><div><small>对方</small><strong>受け手</strong></div>
          <div><small>我方</small><strong>受け手</strong></div><span className="reverse"><ArrowRight size={18}/></span><div><small>对方／给予者</small><strong>くれる</strong></div>
          <div><small>我方／受益者</small><strong>もらう</strong></div><span className="reverse"><ArrowRight size={18}/></span><div><small>对方</small><strong>行為者</strong></div>
        </div>
      </div>
      <nav className="topic-rail" aria-label="本特集目录">
        <span>INDEX</span>
        <a href="#viewpoint"><b>一</b> 视点与方向</a>
        <a href="#causative"><b>二</b> 使役＋授受</a>
        <a href="#reported"><b>三</b> 第三者与转述</a>
        <a href="#other-uses"><b>四</b> 请求等其他用法</a>
        <a href="#close-reading"><b>五</b> 原文与检索</a>
        <a href="#boundaries"><b>六</b> 表达边界</a>
        <a href="#honorifics"><b>七</b> 敬语选择</a>
        <a href="#practice"><b>八</b> 小试一题</a>
      </nav>
    </section>

    <section className="topic-families" aria-label="三组授受动词">
      {families.map(item => <article key={item.title}>
        <span>{item.number}</span><h2>{item.title}</h2><strong>{item.words}</strong>
        <dl><div><dt>主语</dt><dd>{item.role}</dd></div><div><dt>方向</dt><dd>{item.direction}</dd></div></dl>
        <p>{item.note}</p>
      </article>)}
    </section>

    <section className="topic-section causative-section" id="causative">
      <header className="topic-heading"><div><span>二</span><h2>使役决定“谁让谁做”，授受决定“谁因此受益”</h2></div><p>两层意义必须分别判断。只看到「させる」会漏掉许可和恩惠，只看到授受又会漏掉控制关系。</p></header>
      <div className="causative-grid">
        <article><span lang="ja">させてあげる</span><h3 lang="ja">私は子どもを外で遊ばせてあげた。</h3><p>我允许孩子出去玩，并把这项许可看成给予孩子的好处。由于施惠者在前景，也可能显得“我特意准许了你”。</p><small>控制者／给予者：我　受益者：孩子</small></article>
        <article><span lang="ja">させてくれる</span><h3 lang="ja">先生が私に発表させてくれた。</h3><p>老师让我发表；许可从老师流向我。句子感谢的是老师愿意给我机会。</p><small>许可者：老师　受益者／我方：我</small></article>
        <article><span lang="ja">させてもらう</span><h3 lang="ja">私は先生に発表させてもらった。</h3><p>我获得老师许可后进行了发表。受益的“我”在前景，通常暗含曾经申请、协商或取得同意。</p><small>受益者／主语：我　许可者：老师</small></article>
        <article><span lang="ja">させてやる</span><h3 lang="ja">今度こそ、言いたいことを言わせてやる。</h3><p>可表示强势地“让他做”，也可表示替弱者争取机会。语境决定它是照顾、决意还是居高临下。</p><small>口气强烈；不等于礼貌的“允许”</small></article>
      </div>
      <aside className="causative-rule"><strong>拆句顺序</strong><p><span lang="ja">先生が｜私に｜発表させて｜くれた</span> → 先确定老师“让我发表”，再确定这份许可“朝我而来”。</p></aside>
    </section>

    <section className="topic-section reported-section" id="reported">
      <header className="topic-heading"><div><span>三</span><h2>转述别人时，视点跟着谁走</h2></div><p>「くれる」并非永远只能说“给我”。关键是叙述者是否暂时站进当事人的心理范围。</p></header>
      <div className="reported-map">
        <article><span>直接引用 · 保留原说话者视点</span><h3 lang="ja">田中さんは「先生が推薦状を書いてくれた」と言った。</h3><p>引号里的“我方”是田中。虽然现在转述这句话的人不是田中，「くれた」仍保留田中当时的感谢视点。</p></article>
        <article><span>间接转述 · 用受益者作主语最稳定</span><h3 lang="ja">田中さんは先生に推薦状を書いてもらったそうだ。</h3><p>转述者不必假装自己是田中，只说明田中获得了老师的帮助。「てもらう＋そうだ」通常最中性清楚。</p></article>
        <article><span>站在亲近者一边 · 可以用くれる</span><h3 lang="ja">先生が妹に推薦状を書いてくれた。</h3><p>“妹妹”属于说话者的我方范围，因此帮助朝我方流入。若受益者只是无关的第三者，这句会显得视点依据不足。</p></article>
        <article><span>纯粹报道 · 不评价恩惠</span><h3 lang="ja">先生が田中さんの推薦状を書いた。</h3><p>只报告动作事实。若不确定当事人是否把它视为帮助，省去授受表达反而更准确。</p></article>
      </div>
      <div className="reported-check"><b>转述前检查</b><span>原话是谁说的？</span><ArrowRight size={13}/><span>受益者属于谁的“我方”？</span><ArrowRight size={13}/><span>转述者是否要表达感谢？</span></div>
    </section>

    <section className="topic-section other-uses" id="other-uses">
      <header className="topic-heading"><div><span>四</span><h2>授受形式还承担请求、期待、失望与讽刺</h2></div><p>一旦接在动作后面，它表达的往往不是物品转移，而是说话者对这项行动的态度。</p></header>
      <div className="usage-list">
        <article><span>请求</span><h3 lang="ja">ちょっと手伝ってくれる？</h3><p>直接询问对方愿不愿意为我做。亲近自然，但对上级不够郑重。</p></article>
        <article><span>更委婉的请求</span><h3 lang="ja">少し待ってもらえますか。</h3><p>询问“我能否得到你等待这项配合”，比命令更留有余地。</p></article>
        <article><span>希望取得帮助</span><h3 lang="ja">先輩に一度見てもらいたい。</h3><p>「てもらいたい」表达我希望取得前辈查看这项帮助；重点仍是我方希望成为受益者。</p></article>
        <article><span>郑重请求</span><h3 lang="ja">こちらをご確認いただけませんか。</h3><p>用「いただく」的可能否定疑问，把决定权留给对方，是商务场景常见的郑重请求。</p></article>
        <article><span>期待落空</span><h3 lang="ja">誰も助けてくれなかった。</h3><p>不只表示没人帮助，还呈现“我原本期待有人站到我这边”的失落。</p></article>
        <article><span>自然现象拟人化</span><h3 lang="ja">雨が降ってくれて、畑が助かった。</h3><p>把降雨当成朝我方而来的有利事件。自然现象被临时赋予“为我方发生”的感觉。</p></article>
        <article><span>决意／威吓</span><h3 lang="ja">今度こそ勝ってやる。</h3><p>不是“替别人赢”，而是强烈宣告“我一定做给你看”。「てやる」可把行动包装成对外的挑战。</p></article>
        <article><span>反讽</span><h3 lang="ja">よくも騙してくれたな。</h3><p>形式上是「くれる」，实际把不利行为讽刺成“你可真为我做了件好事”，因此产生责难。</p></article>
        <article><span>请求许可，不强调恩惠</span><h3 lang="ja">私にも説明させてください。</h3><p>「させてください」直接请求允许我做；「させていただく」还会把许可解释为我方获得的恩惠，两者不能机械替换。</p></article>
        <article><span>只表达愿望</span><h3 lang="ja">彼にはもっと休んでほしい。</h3><p>「てほしい」表达希望对方做某事，并不声称我已经取得帮助；与「休んでもらいたい」的受益视点不同。</p></article>
      </div>
    </section>

    <section className="topic-section close-reading" id="close-reading">
      <header className="topic-heading"><div><span>五</span><h2>小说里，作者怎样选择视点</h2></div><p>先看四个经过核对的例子，再从数据库里检索更多青空文库原句。</p></header>
      <div className="reading-examples">
        {readings.map((item, index) => <article key={`${item.id}-${item.family}`}>
          <div className="example-source"><span>{String(index + 1).padStart(2, '0')}</span><p>{item.author}</p><h3>『{item.work}』</h3><Link to={`/read/${item.id}`}>进入原文 <ArrowRight size={13}/></Link></div>
          <blockquote lang="ja">「{item.quote}」</blockquote>
          <div className="example-analysis"><span>{item.family}</span><p>{item.analysis}</p></div>
        </article>)}
      </div>
      <p className="source-caution">引文依据本站收录的青空文库公开文本；省略处以“……”表示，没有改写成现代假名。</p>
      <div className="corpus-search">
        <header><div><span>全库用例检索</span><h3>看看作家实际怎么写</h3></div><p>检索范围只包括青空文库中已入库的授受相关段落。结果是语言材料，不代表每一处都具有相同的恩惠含义。</p></header>
        <div className="example-search-tools"><div>{searchForms.map(item => <button key={item.key} className={searchForm === item.key ? 'active' : ''} onClick={() => { setSearchForm(item.key); resetExampleSearch() }}>{item.label}</button>)}</div><label><Search size={15}/><input value={searchQuery} onChange={event => { setSearchQuery(event.target.value); resetExampleSearch() }} placeholder="在结果中追加词语，如：先生、母、許可"/></label></div>
        {searching ? <div className="example-loading"><LoaderCircle className="spin" size={18}/> 正在查找原文…</div> : searchError ? <div className="example-error">{searchError}</div> : <div className="example-results">{examples.map((item, index) => <article key={`${item.id}-${item.ordinal}-${item.form}`}><span>{String(examplePage * topicPageSize + index + 1).padStart(2,'0')} · {searchForms.find(form => form.key === item.form)?.label || item.form}</span><blockquote lang="ja">{item.text}</blockquote><Link to={`/read/${item.id}`}>{item.author}『{item.title}』<ArrowRight size={13}/></Link></article>)}</div>}
        {!searching && !searchError && !examples.length && <p className="example-empty">没有找到相符段落，请缩短追加词语或切换形式。</p>}
        {!searching && !searchError && examples.length > 0 && (examplePage > 0 || hasMoreExamples) && <nav className="example-pagination" aria-label="用例分页"><button onClick={showPreviousExamples} disabled={examplePage === 0}><ArrowLeft size={14}/> 上一页</button><span>第 {examplePage + 1} 页</span><button onClick={showNextExamples} disabled={!hasMoreExamples}>下一页 <ArrowRight size={14}/></button></nav>}
      </div>
    </section>

    <section className="topic-section boundaries" id="boundaries">
      <header className="topic-heading"><div><span>六</span><h2>事实相同，前景不同</h2></div><p>先问“这句话把谁放在画面中央”，再决定形式。</p></header>
      <div className="viewpoint-pair">
        <article><span>给予者在前景</span><h3>清が私に教えて<em>くれた</em>。</h3><p>主语是清。说话者凝视清为“我”做出的行动，因此感谢更直接地落在给予者身上。</p></article>
        <div className="same-event"><ArrowDown size={17}/><b>同一件事</b><ArrowDown size={17}/></div>
        <article><span>受益者在前景</span><h3>私は清に教えて<em>もらった</em>。</h3><p>主语是我。句子聚焦于“我获得了帮助”，也更容易带出我曾请求、安排或争取这件事。</p></article>
      </div>
      <div className="boundary-grid">
        <article><span>受身</span><h3>先生に作文を褒められた。</h3><p>前景是“我受到影响”。影响可以是好，也可以只是意外。</p></article>
        <article><span>授受</span><h3>先生に作文を褒めてもらった。</h3><p>前景是“我得到老师称赞这项行动”，明确把它看作恩惠。</p></article>
        <article><span>使役</span><h3>先生が学生に作文を書かせた。</h3><p>前景是控制、许可或促成，不负责表达谁从中受益。</p></article>
      </div>
    </section>

    <section className="topic-section honorifics" id="honorifics">
      <header className="topic-heading"><div><span>七</span><h2>敬语不是替换表，而是焦点选择</h2></div><p>礼貌程度之外，还要看你准备抬高谁、压低谁，以及恩惠朝哪边流动。</p></header>
      <div className="honorific-list">
        <article><strong>くださる</strong><span>尊敬语 · 抬高给予者</span><p>先生が資料を送ってくださいました。</p></article>
        <article><strong>いただく</strong><span>谦让语Ⅰ · 压低受益的我方</span><p>先生に資料を送っていただきました。</p></article>
        <article><strong>差し上げる</strong><span>谦让语Ⅰ · 我方向外给予</span><p>こちらから資料をお送りして差し上げます。</p></article>
      </div>
      <aside className="itadaku-note"><strong>「させていただく」使用前，检查两件事</strong><p>对方是否真的拥有许可权？我方是否真的因这份许可而受益？两项都不明显时，用普通敬语往往更自然。</p></aside>
    </section>

    <section className="topic-practice" id="practice">
      <div><span>八 · 小试一题</span><h2>把“我方得到的照顾”放进句子</h2><p>以下是根据《坊っちゃん》原句改编的练习。请选择最能表现叙述者受益视点的形式。</p></div>
      <div className="quiz-card">
        <p>清は、寒い夜に蕎麦湯を持って来て（　）。</p>
        <div className="quiz-options">
          {['あげて', 'くれて', 'もらって'].map(option => <button key={option} className={answer === option ? (option === 'くれて' ? 'correct' : 'wrong') : ''} onClick={() => choose(option)} disabled={Boolean(answer)}>{answer === option && (correct ? <Check size={16}/> : <X size={16}/>)}{option}</button>)}
        </div>
        {answer && <div className={`quiz-result ${correct ? 'correct' : 'wrong'}`} role="status"><strong>{correct ? '正解：くれて' : '再看一次：くれて'}</strong><p>清是动作的给予者，照顾朝叙述者“我”而来，所以用「てくれる」。</p><button onClick={() => setAnswer(null)}><RotateCcw size={13}/> 再答一次</button></div>}
      </div>
    </section>

    <section className="topic-related">
      <header><span>继续在原文里观察</span><h2>四篇适合带着“视点”重读的作品</h2></header>
      <div>{relatedWorks.map((work, index) => <Link to={`/read/${work.id}`} key={work.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{work.title}</strong><small>{work.author} · {work.focus}</small></div><ArrowRight size={16}/></Link>)}</div>
    </section>
  </main>
}
