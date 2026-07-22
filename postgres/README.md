# 青空文库 PostgreSQL 后端

这里保存完整青空文库目录的 PostgreSQL 结构与可重复导入工具。它和当前网站使用的 D1 分开，后续可以通过 Cloudflare Hyperdrive 作为正式后端。

## 数据边界

导入器只读取：

- `AOZORA_ROOT/index_pages/list_person_all_extended_utf8.zip`
- 上述元数据中明确列出的 `cards/.../files/*.html`

不会遍历 G 盘，也不会扫描青空文库仓库之外的目录。当前资料快照包含 17,831 部作品，其中 17,737 部有 HTML 正文。

## 数据结构

- `catalog.works`：作品标题、读音、NDC、版权状态、公开日期与统计
- `catalog.people` / `catalog.work_people`：人物及作者、译者等角色
- `catalog.bibliographic_sources`：底本、出版社、输入版和校正版
- `catalog.source_files`：青空文库原始文件 URL、仓库路径、编码、散列和解析错误
- `catalog.work_contents`：原始 HTML、整理后的正文 HTML 与纯文本
- `catalog.chapters` / `catalog.paragraphs`：章节和段落
- `catalog.ruby_annotations` / `catalog.gaiji_annotations`：注音与外字位置
- `app.work_profiles`：JLPT、分类、摘要、选读范围和发布状态，和原始资料分开
- `ops.import_runs`：每次导入的来源提交、状态、数量和错误
- `learning.vocabulary` / `learning.grammar_patterns`：N2、N1 参考词汇与文法，保留释义语言和来源
- `learning.paragraph_*_occurrences`：正文中的安全命中位置；短假名和功能词不会自动标注
- `learning.work_*_stats`：从词汇或文法反查实际出现过的作品
- `learning.work_analysis`：可续跑的作品分析进度和版本

正文偏移量统一使用 Unicode code point，而不是 UTF-16 字节位置。

## 直接连接

连接信息全部通过环境变量提供，密码不会写进仓库：

```bash
export PGHOST=database-host
export PGPORT=5432
export PGUSER=database-user
export PGPASSWORD='database-password'
export PGDATABASE=aozora_reader
export PGSSLMODE=require

npm run db:create
npm run db:migrate
npm run db:import:aozora
npm run db:verify
```

词汇与文法分析是独立的可续跑任务：

```bash
npm run db:import:learning
npm run db:verify:learning
```

Mini PC 上只需在 `G:\git\aozora-reader` 更新代码后双击 `postgres\import-learning-on-minipc.cmd`。它不会重新导入青空文库正文，也不会遍历 G 盘；中断后再次运行会跳过相同分析版本中已经完成的作品。

全量导入可安全重跑。元数据使用 UPSERT；正文只有在文件散列或解析器版本变化时才会重建。调试时可以设置 `AOZORA_METADATA_ONLY=true` 或 `AOZORA_CONTENT_LIMIT=20`。

导入结束后会执行一次存储压缩。原始 HTML 始终以青空文库 Git 仓库为准；数据库只保留作品级检索文本、段落 HTML、段落纯文本以及 ruby/外字结构，避免重复保存同一正文。

## 通过 Cloudflare VPC / Hyperdrive 管理

局域网端口未开放时，可以使用 `postgres/remote/admin-worker.mjs` 作为临时、带随机令牌的远程开发桥。它只应通过 `wrangler dev --remote` 临时启动，用完立即停止，不应部署成长期公开管理接口。

本地脚本在以下变量存在时会改走该临时桥：

```bash
export PGHTTP_ENDPOINT=http://127.0.0.1:8791
export PGHTTP_TOKEN='one-time-random-token'
```

正式网站只应绑定新数据库对应的 Hyperdrive，不能暴露这个管理桥。
