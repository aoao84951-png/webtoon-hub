import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";

type LezhinDay = {
  day: string;
  filter: string;
};

type WebtoonItem = {
  platform: string;
  day: string;
  title: string;
  authors: string;
  schedule: string;
  url: string;
  cover: string;
  isUp: boolean;
};

const LEZHIN_DAYS: LezhinDay[] = [
  { day: "월", filter: "mon" },
  { day: "화", filter: "tue" },
  { day: "수", filter: "wed" },
  { day: "목", filter: "thu" },
  { day: "금", filter: "fri" },
  { day: "토", filter: "sat" },
  { day: "일", filter: "sun" },
];

function normalizeArray(value: any) {
  return Array.isArray(value) ? value : [];
}

function getTitle(item: any) {
  return item.title || item.name || item.displayTitle || "";
}

function getAlias(item: any) {
  return item.alias || item.contentAlias || item.comicAlias || "";
}

function getId(item: any) {
  return String(item.id || item.contentId || item.comicId || item.idLezhinObject || "");
}

function getAuthors(item: any) {
  const artists = normalizeArray(item.artists)
    .map((artist: any) => artist.name || artist.displayName || "")
    .filter(Boolean);

  const authors = normalizeArray(item.authors)
    .map((author: any) => author.name || author.displayName || "")
    .filter(Boolean);

  return [...artists, ...authors].join(", ");
}

function getCoverById(id: string | number, updatedAt?: number) {
  if (!id) return "";

  const base = `https://ccdn.lezhin.com/v2/comics/${id}/images/wide.webp`;
  return updatedAt ? `${base}?updated=${updatedAt}` : base;
}

function isBl(item: any) {
  const genres = normalizeArray(item.genres).map((genre: any) =>
    String(typeof genre === "string" ? genre : genre?.name || genre?.alias || genre?.id || "")
      .toLowerCase()
      .trim()
  );

  return genres.includes("bl");
}

function isUp(item: any) {
  const badges = String(item.badges ?? "").toLowerCase();
  return badges.includes("u");
}

async function fetchLezhinDay(filter: string, offset: number) {
  const url = `https://api.lezhin.com/v2/content-list/weekday?filter=${filter}&offset=${offset}&limit=100`;

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "x-lz-adult": "2",
      "x-lz-allowadult": "true",
      "x-lz-country": "kr",
      "x-lz-genres": "bl",
      "x-lz-locale": "ko-KR",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      cookie: process.env.LEZHIN_COOKIE ?? "",
      referer: "https://www.lezhin.com/ko/scheduled",
      origin: "https://www.lezhin.com",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

function pickList(data: any) {
  return (
    data?.data?.items ||
    data?.data?.list ||
    data?.data?.contents ||
    data?.data ||
    data?.items ||
    data?.list ||
    data?.contents ||
    []
  );
}

function hasNext(data: any, currentCount: number) {
  if (typeof data?.data?.hasNext === "boolean") return data.data.hasNext;
  if (typeof data?.hasNext === "boolean") return data.hasNext;
  return currentCount >= 100;
}

async function fetchTenDayByBrowser(): Promise<WebtoonItem[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      extraHTTPHeaders: {
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "x-lz-adult": "2",
        "x-lz-allowadult": "true",
        "x-lz-country": "kr",
        "x-lz-genres": "bl",
        "x-lz-locale": "ko-KR",
        cookie: process.env.LEZHIN_COOKIE ?? "",
      },
    });

    const page = await context.newPage();

    await page.goto("https://www.lezhin.com/ko/scheduled?day=n", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.waitForTimeout(1200);

    const tenTab = page.locator('[data-value="n"]').first();
    if (await tenTab.count()) {
      await tenTab.click();
      await page.waitForTimeout(1200);
    }

    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(350);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    const items = await page.evaluate(() => {
      function text(el: Element | null) {
        return (el?.textContent || "").replace(/\s+/g, " ").trim();
      }

      const results: WebtoonItem[] = [];
      const seen = new Set<string>();

      document.querySelectorAll<HTMLAnchorElement>('a[href^="/ko/comic/"]').forEach((a) => {
        const fullText = text(a);
        const scheduleMatch = fullText.match(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}\s*일/);

        if (!scheduleMatch) return;
        if (!fullText.toLowerCase().includes("bl")) return;

        const title =
          text(a.querySelector(".lzCardTitle")) ||
          a.querySelector("img")?.getAttribute("alt") ||
          "";

        if (!title) return;

        const metas = Array.from(a.querySelectorAll(".lzCardMeta"))
          .map((el) => text(el))
          .filter(Boolean);

        const schedule = scheduleMatch[0].replace(/\s/g, "");

        const authors = metas
          .filter((v) => v.toLowerCase() !== "bl")
          .filter((v) => v.replace(/\s/g, "") !== schedule)
          .join(", ");

        const img = a.querySelector<HTMLImageElement>("img");
        const cover =
          img?.currentSrc ||
          img?.src ||
          img?.getAttribute("src") ||
          img?.getAttribute("data-src") ||
          "";

        const href = a.getAttribute("href") || "";
        const url = href.startsWith("http") ? href : `https://www.lezhin.com${href}`;

        const key = `${title}-${url}`;
        if (seen.has(key)) return;
        seen.add(key);

        const isUp = fullText.includes("UP");

        results.push({
          platform: "레진코믹스",
          day: "10일",
          title,
          authors,
          schedule,
          url,
          cover,
          isUp,
        });
      });

      return results;
    });

    console.log("[lezhin ten-day browser parsed]", items.length);
    console.log("[lezhin ten-day browser no-cover]", items.filter((item) => !item.cover).map((item) => item.title));

    await context.close();

    return items;
  } finally {
    await browser.close();
  }
}

function dedupeItems(items: WebtoonItem[]) {
  const seen = new Set<string>();
  const results: WebtoonItem[] = [];

  for (const item of items) {
    const key = `${item.day}-${item.platform}-${item.url || item.title}`;

    if (seen.has(key)) continue;

    seen.add(key);
    results.push(item);
  }

  return results;
}

export async function GET() {
  try {
    const results: WebtoonItem[] = [];

    for (const dayItem of LEZHIN_DAYS) {
      let offset = 0;

      while (offset <= 1000) {
        const data = await fetchLezhinDay(dayItem.filter, offset);
        if (!data) break;

        const list = pickList(data);
        if (!Array.isArray(list) || list.length === 0) break;

        for (const item of list) {
          if (!isBl(item)) continue;

          const id = getId(item);
          const alias = getAlias(item);
          const title = getTitle(item);

          if (!id || !alias || !title) continue;

          results.push({
            platform: "레진코믹스",
            day: dayItem.day,
            title,
            authors: getAuthors(item),
            schedule: dayItem.day,
            url: `https://www.lezhin.com/ko/comic/${alias}`,
            cover: getCoverById(id, item.updatedAt),
            isUp: isUp(item),
          });
        }

        if (!hasNext(data, list.length)) break;
        offset += 100;
      }
    }

    const tenDayItems = await fetchTenDayByBrowser();

    const items = dedupeItems([...results, ...tenDayItems]);

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        message: "레진 데이터를 불러오지 못했습니다.",
        items: [],
      },
      { status: 500 }
    );
  }
}