async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

async function main() {
  if (options.chklist) {
    // 巡回リストモード
    const list = await loadList(options.chklist);
    for (const entry of list) {
      const saveDir = options.savedir || ".";
      const savePath = `${saveDir}/${entry.file_name}.txt`;
      const html = await fetchHtml(entry.url);
      const episodes = await parseNovelIndex(html);
      let allText = "";
      await downloadEpisodesWithProgress(episodes, async (epUrl) => {
        const epHtml = await fetchHtml(epUrl);
        const body = parseEpisodeBody(epHtml);
        const aozora = aozoraFormatter(body, "");
        allText += aozora + "\n";
        return aozora;
      });
      if (!options.dryRun) await saveTextFile(savePath, allText);
    }
    return;
  }
  if (url && url.startsWith(urlPrefix + "/works/")) {
    // URL指定モード（全話取得: Playwright使用）
    try {
      const { scrapeAllEpisodes } = await import("./kakuyomu-episodes-scraper.ts");
      const episodesRaw: { title: string; url: string }[] = await scrapeAllEpisodes(url);
      // downloadEpisodesWithProgressの型に合わせてupdate: "" を付与し、URLバリデーションも強化
      const episodes = episodesRaw
        .filter(ep => typeof ep.url === 'string' && ep.url.startsWith('http'))
        .map(ep => ({ ...ep, update: "" }));
      if (episodes.length === 0) {
        console.error("エピソードURLが取得できませんでした");
        process.exit(1);
      }
      let allText = "";
      await downloadEpisodesWithProgress(episodes, async (epUrl: string) => {
        // episodes配列の中でepUrlからエピソード情報を取得
        const ep = episodes.find(e => e.url === epUrl);
        const epHtml = await fetchHtml(epUrl);
        const body = parseEpisodeBody(epHtml);
        const aozora = aozoraFormatter(body, ep?.title || "");
        allText += aozora + "\n";
        return aozora;
      });
      if (!options.dryRun) await saveTextFile("output.txt", allText);
      return;
    } catch (e) {
      console.error("Playwrightによる全話取得に失敗:", e);
      process.exit(1);
    }
  }
  console.error("URLまたは--chklistを指定してください");
}
/**
 * テキストを指定パスに保存
 */
async function saveTextFile(path: string, text: string) {
  await Bun.write(path, text);
}
import cliProgress from "cli-progress";
import { Command } from "commander";
import { readFile } from "fs/promises";

/**
 * 進捗バー付きで複数エピソードをダウンロードする雛形
 */
async function downloadEpisodesWithProgress(episodes: { title: string; url: string; update: string }[], fetchBody: (url: string) => Promise<string>) {
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(episodes.length, 0);
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]!;
    await fetchBody(ep.url);
    bar.update(i + 1);
  }
  bar.stop();
}

/**
 * sample.lst形式のリストファイルを読み込む
 * @param path ファイルパス
 * @returns Array<{ title: string, file_name: string, url: string, update?: string }>
 */
async function loadList(path: string) {
  const content = await readFile(path, "utf-8");
  const records = content.split(/\n{2,}/).map(block => {
    const obj: any = {};
    block.split(/\n/).forEach(line => {
      const m = line.match(/^(title|file_name|url|update) *= *(.*)$/);
      if (m && m[1] && m[2]) obj[m[1]] = m[2].replace(/^"|"$/g, "");
    });
    return obj.title ? obj : null;
  }).filter(Boolean);
  return records;
}
/**
 * エピソード本文HTMLから本文テキストを抽出し、青空文庫形式に整形
 * @param html エピソードページのHTML
 * @returns string 整形済み本文
 */
function parseEpisodeBody(html: string): string {
  const $ = cheerio.load(html);
  let bodyHtml = $(".widget-episodeBody").html() || "";
  // <br>→改行
  bodyHtml = bodyHtml.replace(/<br\s*\/?>(\r?\n)?/g, "\n");
  // ルビ対応 <ruby>漢字<rt>かんじ</rt></ruby> → ｜漢字《かんじ》
  bodyHtml = bodyHtml.replace(/<ruby>(.+?)<rt>(.+?)<\/rt><\/ruby>/g, "｜$1《$2》");
  // 傍点対応 <em>強調</em> → ［＃傍点］強調［＃傍点終わり］
  bodyHtml = bodyHtml.replace(/<em>(.+?)<\/em>/g, "［＃傍点］$1［＃傍点終わり］");
  // その他タグ除去
  bodyHtml = bodyHtml.replace(/<[^>]+>/g, "");
  // 空白行除去
  bodyHtml = bodyHtml.replace(/^\s+$/gm, "");
  // 記号置換
  bodyHtml = bodyHtml.replace(/！！/g, "!!");
  bodyHtml = bodyHtml.replace(/！？/g, "!?\?");
  return bodyHtml.trim();
}

/**
 * 青空文庫形式の中見出し・改ページ等で整形
 */
function aozoraFormatter(text: string, title: string): string {
  const separator = "▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼\n";
  const kaipage = "［＃改ページ］\n";
  const midasi = `\n［＃中見出し］${title}［＃中見出し終わり］\n\n\n`;
  return kaipage + separator + midasi + text + "\n\n" + separator;
}

const program = new Command();

program
  .name("kakuyomu-dl")
  .description("カクヨムの投稿小説を青空文庫形式でダウンロードするツール")
  .option("-c, --chklist <file>", "巡回リストファイルを指定")
  .option("-s, --savedir <dir>", "保存先ディレクトリを指定")
  .option("-u, --update <date>", "指定日付以降のデータのみダウンロード (YY-MM-DD)")
  .option("-n, --dry-run", "実際には書き込まずに実行")
  .option("-h, --help", "ヘルプを表示")
  .argument("[url]", "カクヨム小説の目次URL")
  .parse(process.argv);

const options = program.opts();
const url = program.args[0];

if (options.help) {
  program.help();
}

import * as cheerio from "cheerio";

const urlPrefix = "https://kakuyomu.jp";

/**
 * 目次ページのHTMLからエピソード一覧を取得
 * @param html 目次ページのHTML
 * @returns Array<{ title: string, url: string, update: string }>
 */
async function parseNovelIndex(html: string) {
  const $ = cheerio.load(html);
  const episodes: { title: string; url: string; update: string }[] = [];
  // 目次ページ内の/episodes/リンクをすべて抽出
  $("a[href*='/episodes/']").each((_, el) => {
    const href = $(el).attr("href");
    // /episodes/を含むリンクのみ対象
    if (!href || !href.includes('/episodes/')) return;
    // タイトルはリンクテキスト
    const title = $(el).text().trim();
    // 日付は親要素や隣接要素から取得できれば取得
    let update = "";
    const dateText = $(el).parent().text();
    const dateMatch = dateText.match(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})/);
    if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, '0');
      const d = dateMatch[3].padStart(2, '0');
      update = `${y}-${m}-${d}`;
    }
    // 絶対URLでなければ付与
    const absUrl = href.startsWith('http') ? href : urlPrefix + href;
    episodes.push({
      title,
      url: absUrl,
      update,
    });
  });
  // 重複除去（同じ話が複数回出る場合）
  const seen = new Set();
  return episodes.filter(ep => {
    if (seen.has(ep.url)) return false;
    seen.add(ep.url);
    return true;
  });
}

export { options, parseNovelIndex, url };
main();