import { chromium } from 'playwright';

/**
 * カクヨムの目次ページで「つづきを表示」を全てクリックし、全エピソードURLを抽出する
 * @param url 目次ページURL
 * @returns エピソード情報配列 [{title, url}]
 */
export async function scrapeAllEpisodes(url: string): Promise<{ title: string; url: string }[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // まず __NEXT_DATA__ のJSONから全話を抽出
  let allEpisodes: { title: string; url: string }[] = [];
  try {
    const nextData = await page.$eval('#__NEXT_DATA__', el => el.textContent || '');
    if (nextData) {
      const obj = JSON.parse(nextData);
      const apollo = obj.props?.pageProps?.__APOLLO_STATE__;
      if (apollo) {
        // 作品IDを特定
        const workKey = Object.keys(apollo).find(k => k.startsWith('Work:'));
        let workId = '';
        if (workKey) {
          const workObj = apollo[workKey];
          workId = workObj?.id || '';
        }
        // 各エピソードのwork参照をたどる
        const keys = Object.keys(apollo).filter(k => /^Episode:\d+/.test(k));
        allEpisodes = keys.map(k => {
          const ep = apollo[k];
          // workIdはエピソードのwork.__refから取得
          let epWorkId = workId;
          if (ep.work && typeof ep.work === 'object' && ep.work.__ref) {
            const ref = ep.work.__ref;
            if (apollo[ref] && apollo[ref].id) epWorkId = apollo[ref].id;
          }
          return {
            title: ep.title || '',
            url: epWorkId ? `${url}/episodes/${ep.id}` : ''
          };
        }).filter(ep => ep.title && ep.url);
        // 公開順にソート（publishedAtがあれば）
        allEpisodes.sort((a, b) => {
          const ea = apollo[`Episode:${a.url.split('/').pop()}`];
          const eb = apollo[`Episode:${b.url.split('/').pop()}`];
          return (ea?.publishedAt || '').localeCompare(eb?.publishedAt || '');
        });
      }
    }
  } catch (e) {
    // JSON取得失敗時は従来方式にフォールバック
  }

  // JSONから取得できた場合はそれを返す
  if (allEpisodes.length > 0) {
    await browser.close();
    return allEpisodes;
  }

  // フォールバック: 目次タブ（1〜30, 31〜60, ...）のリンクをすべて取得
  const tabSelectors = await page.$$eval('a', (links) => {
    return links
      .filter((el) => /\d+〜\d+/.test(el.textContent || ''))
      .map((el) => {
        return {
          text: el.textContent || '',
          selector: el.getAttribute('href') || ''
        };
      });
  });
  const tabUrls = [url];
  for (const tab of tabSelectors) {
    if (tab.selector && !tab.selector.startsWith('http')) {
      const u = new URL(tab.selector, url).toString();
      if (!tabUrls.includes(u)) tabUrls.push(u);
    }
  }
  const seen = new Set();
  for (const tabUrl of tabUrls) {
    await page.goto(tabUrl, { waitUntil: 'domcontentloaded' });
    while (true) {
      const moreBtn = await page.$('button:has-text("つづきを表示")');
      if (!moreBtn) break;
      await moreBtn.click();
      await page.waitForTimeout(500);
    }
    const episodes = await page.$$eval('a[href*="/episodes/"]', (links) => {
      return links.map((el) => {
        const href = (el as HTMLAnchorElement).href;
        const title = (el as HTMLAnchorElement).textContent?.trim() || '';
        return { title, url: href };
      });
    });
    for (const ep of episodes) {
      if (!ep.url || seen.has(ep.url)) continue;
      seen.add(ep.url);
      allEpisodes.push(ep);
    }
  }
  await browser.close();
  return allEpisodes;
}

// CLIテスト用
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: bun kakuyomu-episodes-scraper.ts <目次URL>');
    process.exit(1);
  }
  scrapeAllEpisodes(url).then((eps) => {
    console.log(JSON.stringify(eps, null, 2));
  });
}
