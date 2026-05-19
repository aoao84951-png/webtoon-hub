import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MrBlueWebtoon = {
  pid: string;
  title: string;
  writer: string;
  authors: string;
  cover: string;
  url: string;
  platform: string;
  day: string;
  schedule: string;
  isUp: boolean;
};

const MOBILE_BASE_URL = "https://m.mrblue.com";
const PC_BASE_URL = "https://www.mrblue.com";

const DAYS = [
  { key: "MON", label: "월" },
  { key: "TUE", label: "화" },
  { key: "WED", label: "수" },
  { key: "THU", label: "목" },
  { key: "FRI", label: "금" },
  { key: "SAT", label: "토" },
  { key: "SUN", label: "일" },
  { key: "TEN_DAYS", label: "10일" },
];

function absolutizeUrl(url: string) {
  if (!url) return MOBILE_BASE_URL;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${MOBILE_BASE_URL}${url}`;
  return `${MOBILE_BASE_URL}/${url}`;
}

function getPidFromText(text: string) {
  return text.match(/wt_\d+/)?.[0] ?? "";
}

function getCoverFromPid(pid: string) {
    return pid ? `https://img.mrblue.com/prod_img/comics/${pid}/square_w300.jpg` : "";
}

function normalizeCover(src: string) {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `${MOBILE_BASE_URL}${src}`;
  return src;
}

function pickCover($: cheerio.CheerioAPI, el: any, pid: string) {
    const imgs = $(el).find("img").toArray();
  
    for (const imgEl of imgs) {
      const img = $(imgEl);
  
      const candidates = [
        img.attr("src"),
        img.attr("data-src"),
        img.attr("data-original"),
        img.attr("data-lazy"),
        img.attr("data-image"),
        img.attr("data-url"),
        img.attr("srcset"),
      ].filter(Boolean) as string[];
  
      for (const raw of candidates) {
        if (
          raw.includes("img.mrblue.com") &&
          !raw.includes("label-contest") &&
          !raw.includes("_next/static")
        ) {
          const match = raw.match(/https?:\/\/img\.mrblue\.com[^"' ,)]+/);
          if (match?.[0]) return match[0];
        }
      }
    }
  
    const styleText = $(el)
      .find("[style]")
      .toArray()
      .map((v) => $(v).attr("style") || "")
      .join(" ");
  
    const styleMatch = styleText.match(/https?:\/\/img\.mrblue\.com[^"' )]+/);
    if (styleMatch?.[0]) return styleMatch[0];
  
    return getCoverFromPid(pid);
}

async function fetchHtml(url: string, mode: "pc" | "mobile") {
  const res = await fetch(url, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent":
        mode === "pc"
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
          : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      referer: mode === "pc" ? PC_BASE_URL : MOBILE_BASE_URL,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("[mrblue fetch failed]", url, res.status);
    return "";
  }

  return res.text();
}

function parseTotalPage(html: string) {
  const totalMatch = html.match(/total:\s*(\d+)/);
  if (totalMatch?.[1]) return Number(totalMatch[1]);

  const lastPageMatch = html.match(/data-page=["'](\d+)["'][^>]*class=["']btn-last["']/);
  if (lastPageMatch?.[1]) return Number(lastPageMatch[1]);

  return 1;
}

function parseBlPidsFromGenreHtml(html: string) {
  const $ = cheerio.load(html);
  const pids = new Set<string>();

  $("#listBox li[data-pid], li[data-pid]").each((_, el) => {
    const pid = $(el).attr("data-pid");
    if (pid?.startsWith("wt_")) pids.add(pid);
  });

  return pids;
}

async function fetchBlPids() {
  const blPids = new Set<string>();

  const firstUrl = `${PC_BASE_URL}/webtoon/genre/bl`;
  const firstHtml = await fetchHtml(firstUrl, "pc");

  if (!firstHtml) {
    console.error("[mrblue bl] first page empty");
    return blPids;
  }

  const totalPage = parseTotalPage(firstHtml);
  parseBlPidsFromGenreHtml(firstHtml).forEach((pid) => blPids.add(pid));

  for (let page = 2; page <= totalPage; page++) {
    const url = `${PC_BASE_URL}/webtoon/genre/bl/${page}`;
    const html = await fetchHtml(url, "pc");

    if (!html) continue;

    const before = blPids.size;
    parseBlPidsFromGenreHtml(html).forEach((pid) => blPids.add(pid));

  }

  return blPids;
}

function parseItems(html: string, day: string, blPids: Set<string>) {
  const $ = cheerio.load(html);
  const results: MrBlueWebtoon[] = [];

  $(".WebtoonContentList_wrapper__8pLne li").each((_, el) => {
    const link = $(el).find("a").first().attr("href") || "";
    const fullUrl = absolutizeUrl(link);
    const pid = getPidFromText(fullUrl);

    if (!pid || !blPids.has(pid)) return;

    const title = $(el).find(".CategoryTitle_title__D74vo").first().text().trim();
    if (!title) return;

    const writer = $(el).find(".CategoryTitle_text-desc__BvYr0").first().text().trim();

    const isUp =
        $(el).text().toUpperCase().includes("UP") ||
        $(el).find('[class*="up"], [class*="Up"], [class*="UP"]').length > 0 ||
        $(el).find('img[alt*="UP"], img[src*="up"], img[src*="UP"]').length > 0;

    results.push({
        pid,
        title,
        writer,
        authors: writer,
        cover: pickCover($, el, pid),
        url: fullUrl,
        platform: "미스터블루",
        day,
        schedule: day === "10일" ? "10일 주기" : day,
        isUp,
    });
  });

  return results;
}

async function fetchDay(day: { key: string; label: string }, blPids: Set<string>) {
  const url = `${MOBILE_BASE_URL}/webtoon/weekday?schedule=${day.key}`;
  const html = await fetchHtml(url, "mobile");

  if (!html) return [];

  const items = parseItems(html, day.label, blPids);

  return items;
}

function dedupe(items: MrBlueWebtoon[]) {
  const map = new Map<string, MrBlueWebtoon>();

  for (const item of items) {
    const key = `${item.day}-${item.pid}`;
    if (!map.has(key)) map.set(key, item);
  }

  return Array.from(map.values());
}

export async function GET() {
  try {
    const blPids = await fetchBlPids();

    const results: MrBlueWebtoon[] = [];

    for (const day of DAYS) {
      const items = await fetchDay(day, blPids);
      results.push(...items);
    }

    const unique = dedupe(results);

    return NextResponse.json({
      ok: true,
      count: unique.length,
      items: unique,
      webtoons: unique,
    });
  } catch (error) {
    console.error("MRBLUE ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        count: 0,
        items: [],
        webtoons: [],
        message: "미스터블루 데이터를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}