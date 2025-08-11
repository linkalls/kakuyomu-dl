# kakuyomu-dl (TypeScript/Bun/Playwright 版)

カクヨム投稿小説を青空文庫形式で一括ダウンロードするツール（TypeScript/Bun/Playwright 製）

## 特徴

- Playwright による全話自動取得（「つづきを表示」やタブ分割も対応）
- ルビ・傍点対応、青空文庫形式で出力
- 巡回リストによる複数作品の自動巡回ダウンロード
- CLI ユーティリティとしても利用可能

---

## セットアップ

### 必要なもの

- [Bun](https://bun.sh/)（Node.js 互換の高速ランタイム）
- [Playwright](https://playwright.dev/)（Web 自動操作）
- その他依存: cli-progress, commander, cheerio

### インストール手順

```sh
git clone https://github.com/linkalls/kakuyomu-dl.git
cd kakuyomu-dl
bun install
bunx playwright install install-deps
bunx playwright install
```

---

## 使い方

### 1. 目次 URL から全話ダウンロード（青空文庫形式）

```sh
bun run index.ts https://kakuyomu.jp/works/xxxxxxxxxxxxxxx
```

→ 作品タイトル.txt で全話を青空文庫形式で保存

### 2. 巡回リストで複数作品を一括ダウンロード(うごくかわからない)

```sh
bun run index.ts --chklist sample.lst --savedir ./output
```

→ sample.lst の各作品を ./output/ 以下に個別保存

#### 巡回リスト（sample.lst）形式(うごくかわからない)

```
title = 作品名
file_name = 保存ファイル名
url = https://kakuyomu.jp/works/xxxxxxxxxxxxxxx
```

（空行区切り、サンプル同梱）

### 3. エピソード URL 一覧だけ取得したい場合

```sh
bun run kakuyomu-episodes-scraper.ts https://kakuyomu.jp/works/xxxxxxxxxxxxxxx --urls
```

→ 各エピソードの URL を 1 行ずつ出力

---

## 依存パッケージ

- Bun
- Playwright
- cli-progress
- commander
- cheerio

---


## ライセンス

GPLv2
