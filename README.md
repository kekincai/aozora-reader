# 青空しおり

青空文庫の著作権が切れた作品を、N2〜N1の日本語学習者が「読み切れる」形に整えるオープンソースの読書サイトです。

## 現在できること

- N2中心・N1までの10作品を、レベル・長さ・ジャンルで選ぶ
- ルビの表示切替、学習片と原文全文の切替
- 本文に出るN2/N1語彙と文法を文字へ直接標示し、タップして中国語の意味・接続・用例を確認
- 語彙を五十音順、文法を働き別に検索し、使われている作品へ逆引き
- 語彙・文法を復習へ追加
- 読書進捗・語彙・簡易統計を端末内に保存
- Passkey（Face ID / Touch ID / Windows Hello など）で無料登録・クラウド同期
- 青空文庫の原文・出典を各作品に表示
- PC / スマートフォン対応

登録しなくても利用でき、記録はブラウザ内に保存されます。任意でPasskeyを作るとCloudflare D1へ同期され、対応する別端末でも続きを読めます。生体情報そのものは端末の外へ送信されません。GoogleログインはOAuthクライアント取得後に追加できる構成です。

## 開発

```bash
npm install
npm run import:aozora
npm run dev
```

`import:aozora` は既定で `/Volumes/minipc-1/git/aozorabunko` を読みます。別の場所なら `AOZORA_ROOT` を指定してください。リポジトリ全体を走査せず、選定済みのファイルだけを読み込みます。

処理結果は二つの形で生成します。

- `data/aozora-learning.sqlite`: 継続加工用のローカル派生データベース（Git管理外）
- `public/learning/index.json` と `public/corpus/`: Cloudflareへ配る静的な学習索引と注釈済み本文

SQLiteには作品、5,311語のN2/N1参考語彙、434項目の中国語文法説明、作品内出現回数と逆引き索引を保存します。動詞・形容詞はkuromojiで基本形へ戻して照合し、本文の文法標示は誤検出しやすい一文字・曖昧表現を除いた保守的な一致だけに限定します。

## 検証とデプロイ

```bash
npm test
npm run lint
npm run build
npm run deploy
```

公開版は Cloudflare Workers の静的アセット配信、API と D1 を利用しています。静的ファイルはWorkerを経由せず配信し、`/api/*` だけを動的処理するため、通常の個人利用なら無料枠で運用できます。

## 出典とライセンス

本文は[青空文庫](https://www.aozora.gr.jp/)の「著作権なし」作品から生成しています。各JSONに原文URLと出典を保持しています。アプリケーションコードはMITライセンスです。

JLPTは現在、級別の完全な公式語彙・文法リストを公開していません。そのためサイト内のN1/N2表示は学習用の参考分類です。語彙リストは[Tanos](https://www.tanos.co.uk/jlpt/)（CC BY）をHanabira公開データ経由で利用し、文法説明は[Hanabira Japanese Content](https://github.com/tristcoil/hanabira.org-japanese-content)（Creative Commons・要表示）を利用しています。形態解析には[kuromoji.js](https://github.com/takuyaa/kuromoji.js)（Apache-2.0）を使用しています。
