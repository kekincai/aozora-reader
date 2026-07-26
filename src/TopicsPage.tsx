import { useState } from 'react'
import { ArrowDown, ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { trackEvent } from './operations'

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

export function TopicsPage() {
  const [answer, setAnswer] = useState<string | null>(null)
  const choose = (value: string) => {
    setAnswer(value)
    trackEvent('learning_open', { path: '/topics', label: `giving-receiving-quiz:${value}` })
  }
  const correct = answer === 'くれて'

  return <main className="topics-page">
    <section className="topic-hero" id="viewpoint">
      <div className="topic-hero-main">
        <p className="topic-series">专题一 · 授受動詞</p>
        <h1>谁的立场，<br/>看见了这份<em>恩惠</em></h1>
        <p className="topic-lead">あげる・くれる・もらう不只是“给”和“收”。同一件事，因为说话者站的位置不同，日语会选择不同的动词。先看视点，再看动作。</p>
        <div className="topic-flow" aria-label="授受动词的三个方向">
          <div><small>我方／给予者</small><strong>あげる</strong></div><span><ArrowRight size={18}/></span><div><small>对方</small><strong>受け手</strong></div>
          <div><small>我方</small><strong>受け手</strong></div><span className="reverse"><ArrowRight size={18}/></span><div><small>对方／给予者</small><strong>くれる</strong></div>
          <div><small>我方／受益者</small><strong>もらう</strong></div><span className="reverse"><ArrowRight size={18}/></span><div><small>对方</small><strong>行為者</strong></div>
        </div>
      </div>
      <nav className="topic-rail" aria-label="本专题目录">
        <span>INDEX</span>
        <a href="#viewpoint"><b>一</b> 视点与方向</a>
        <a href="#close-reading"><b>二</b> 原文近读</a>
        <a href="#boundaries"><b>三</b> 表达边界</a>
        <a href="#honorifics"><b>四</b> 敬语选择</a>
        <a href="#practice"><b>五</b> 小试一题</a>
      </nav>
    </section>

    <section className="topic-families" aria-label="三组授受动词">
      {families.map(item => <article key={item.title}>
        <span>{item.number}</span><h2>{item.title}</h2><strong>{item.words}</strong>
        <dl><div><dt>主语</dt><dd>{item.role}</dd></div><div><dt>方向</dt><dd>{item.direction}</dd></div></dl>
        <p>{item.note}</p>
      </article>)}
    </section>

    <section className="topic-section close-reading" id="close-reading">
      <header className="topic-heading"><div><span>二</span><h2>小说里，作者怎样选择视点</h2></div><p>语法书告诉我们形式；文学原句让我们看到，形式如何改变人物之间的距离。</p></header>
      <div className="reading-examples">
        {readings.map((item, index) => <article key={`${item.id}-${item.family}`}>
          <div className="example-source"><span>{String(index + 1).padStart(2, '0')}</span><p>{item.author}</p><h3>『{item.work}』</h3><Link to={`/read/${item.id}`}>进入原文 <ArrowRight size={13}/></Link></div>
          <blockquote>「{item.quote}」</blockquote>
          <div className="example-analysis"><span>{item.family}</span><p>{item.analysis}</p></div>
        </article>)}
      </div>
      <p className="source-caution">引文依据本站收录的青空文库公开文本；省略处以“……”表示，没有改写成现代假名。</p>
    </section>

    <section className="topic-section boundaries" id="boundaries">
      <header className="topic-heading"><div><span>三</span><h2>事实相同，前景不同</h2></div><p>先问“这句话把谁放在画面中央”，再决定形式。</p></header>
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
      <header className="topic-heading"><div><span>四</span><h2>敬语不是替换表，而是焦点选择</h2></div><p>礼貌程度之外，还要看你准备抬高谁、压低谁，以及恩惠朝哪边流动。</p></header>
      <div className="honorific-list">
        <article><strong>くださる</strong><span>尊敬语 · 抬高给予者</span><p>先生が資料を送ってくださいました。</p></article>
        <article><strong>いただく</strong><span>谦让语Ⅰ · 压低受益的我方</span><p>先生に資料を送っていただきました。</p></article>
        <article><strong>差し上げる</strong><span>谦让语Ⅰ · 我方向外给予</span><p>こちらから資料をお送りして差し上げます。</p></article>
      </div>
      <aside className="itadaku-note"><strong>「させていただく」使用前，检查两件事</strong><p>对方是否真的拥有许可权？我方是否真的因这份许可而受益？两项都不明显时，用普通敬语往往更自然。</p></aside>
    </section>

    <section className="topic-practice" id="practice">
      <div><span>五 · 小试一题</span><h2>把“我方得到的照顾”放进句子</h2><p>以下是根据《坊っちゃん》原句改编的练习。请选择最能表现叙述者受益视点的形式。</p></div>
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
      <p>本专题依据用户的授受动词研究整理，并用青空文库原文重新验证和组织；解释部分为中文学习说明。</p>
    </section>
  </main>
}
