import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

type RidiDay = {
  day: string;
  url: string;
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

const RIDI_DAYS: RidiDay[] = [
  { day: "월", url: "https://ridibooks.com/group-tab/2497/8" },
  { day: "화", url: "https://ridibooks.com/group-tab/2497/9" },
  { day: "수", url: "https://ridibooks.com/group-tab/2497/10" },
  { day: "목", url: "https://ridibooks.com/group-tab/2497/11" },
  { day: "금", url: "https://ridibooks.com/group-tab/2497/12" },
  { day: "토", url: "https://ridibooks.com/group-tab/2497/13" },
  { day: "일", url: "https://ridibooks.com/group-tab/2497/14" },
  { day: "10일", url: "https://ridibooks.com/group-tab/2497/15" },
];

const MAX_PAGE = 8;

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeUrl(href: string) {
  if (href.startsWith("http")) return href;
  return `https://ridibooks.com${href}`;
}

function getBookId(href: string) {
  return href.match(/\/books\/(\d+)/)?.[1] ?? "";
}

function getCoverUrl(bookId: string) {
  return bookId ? `https://img.ridicdn.net/cover/${bookId}/xxlarge` : "";
}

function getCycleText($: cheerio.CheerioAPI, el: any) {
  const texts = $(el)
    .find("span, div")
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean);

  return (
    texts.find((text) => {
      const clean = text.replace(/\s/g, "");
      return /^\d{1,2},\d{1,2}(,\d{1,2})?일$/.test(clean);
    }) ?? ""
  );
}

function getTitleFromItem(
  $: cheerio.CheerioAPI,
  el: any,
  href: string
) {
  const candidates = $(el)
    .find(`a[href="${href}"]`)
    .map((_, a) => cleanText($(a).text()))
    .get()
    .filter(Boolean)
    .filter((text) => !text.includes("Up"))
    .filter((text) => !/^\d{1,2}\s*,\s*\d{1,2}(?:\s*,\s*\d{1,2})?\s*일$/.test(text))
    .filter((text) => !/^\d+(\.\d+)?\(\s*[\d,]+\s*\)$/.test(text));

  return candidates.sort((a, b) => b.length - a.length)[0] ?? "";
}

function getPageUrl(baseUrl: string, page: number) {
  if (page === 1) return baseUrl;
  return `${baseUrl}?page=${page}`;
}

function hasNextPage($: cheerio.CheerioAPI) {
  return (
    $('a[aria-label="다음 페이지"]').length > 0 ||
    $('a[rel="next"]').length > 0 ||
    $("a")
      .toArray()
      .some((a) => cleanText($(a).text()) === "다음")
  );
}

function hasUpBadge($: cheerio.CheerioAPI, el: any) {
  const htmlText = $(el).html() ?? "";
  const text = cleanText($(el).text());

  return (
    $(el).find('[aria-label="Up"]').length > 0 ||
    $(el).find('[alt="Up"]').length > 0 ||
    htmlText.includes("badge/on_book_cover/up") ||
    htmlText.includes("up.b21a0bba") ||
    /(^|[^a-zA-Z])up([^a-zA-Z]|$)/i.test(text)
  );
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!res.ok) return "";
  return res.text();
}

export async function GET() {
  const results: WebtoonItem[] = [];
  const seen = new Set<string>();

  try {
    for (const dayItem of RIDI_DAYS) {
      let page = 1;

      while (page <= MAX_PAGE) {
        const html = await fetchHtml(getPageUrl(dayItem.url, page));
        if (!html) break;

        const $ = cheerio.load(html);
        let addedInThisPage = 0;

        $('a[href^="/books/"]').each((_, a) => {
          const href = $(a).attr("href") ?? "";
          if (!href) return;

          const li = $(a).closest("li").get(0);
          if (!li) return;

          const bookId = getBookId(href);
          if (!bookId) return;

          const title = getTitleFromItem($, li, href);
          if (!title) return;

          const key = `${dayItem.day}-${bookId}`;
          if (seen.has(key)) return;
          seen.add(key);

          const authors = $(li)
            .find('a[href^="/author/"]')
            .map((_, author) => cleanText($(author).text()))
            .get()
            .filter(Boolean)
            .join(", ");

          const cycleText = getCycleText($, li);

          results.push({
            platform: "리디",
            day: dayItem.day,
            title,
            authors,
            schedule: cycleText || dayItem.day,
            url: normalizeUrl(href),
            cover: getCoverUrl(bookId),
            isUp: hasUpBadge($, li),
          });

          addedInThisPage += 1;
        });

        if (addedInThisPage === 0) break;
        if (!hasNextPage($)) break;

        page += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      items: results,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        message: "리디 데이터를 불러오지 못했습니다.",
        items: [],
      },
      { status: 500 }
    );
  }
}