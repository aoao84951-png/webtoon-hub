export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const DAYS = [
  { key: "MONDAY", label: "월" },
  { key: "TUESDAY", label: "화" },
  { key: "WEDNESDAY", label: "수" },
  { key: "THURSDAY", label: "목" },
  { key: "FRIDAY", label: "금" },
  { key: "SATURDAY", label: "토" },
  { key: "SUNDAY", label: "일" },
  { key: "TEN", label: "10일" },
];

const BOMTOON_GENRE_BL = "9";

function token() {
  return (process.env.BOMTOON_AUTH_TOKEN || "").replace(/^Bearer\s+/i, "").trim();
}

function headers(extra: Record<string, string> = {}) {
  const authToken = token();
  const cookie = process.env.BOMTOON_COOKIE || "";

  return {
    accept: "*/*",
    ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    ...(cookie ? { cookie } : {}),
    referer: "https://www.bomtoon.com/bom/comic/weekly",
    "x-balcony-id": "BOMTOON_COM",
    "x-balcony-timezone": "Asia/Seoul",
    "x-platform": "MOBILE_AND",
    "x-referer": "https://www.bomtoon.com/bom/comic/weekly",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
    ...extra,
  };
}

function pickCover(item: any) {
  const list = item?.thumbnails || item?.thumbnailList || item?.thumbnail || [];

  if (!Array.isArray(list)) return "";

  return (
    list.find((v: any) => v?.type === "VERTICAL")?.imagePath ||
    list.find((v: any) => v?.type === "MAIN")?.imagePath ||
    list.find((v: any) => v?.thumbnailType === "VERTICAL")?.imagePath ||
    list.find((v: any) => v?.thumbnailType === "MAIN")?.imagePath ||
    list[0]?.imagePath ||
    ""
  );
}

function getAuthors(item: any) {
  if (typeof item?.creators === "string") return item.creators;

  if (Array.isArray(item?.creators)) {
    return item.creators.map((v: any) => v?.name).filter(Boolean).join("&");
  }

  return item?.authorName || item?.artistName || "작가 정보 없음";
}

async function fetchIds(day: any) {
  const url =
    `https://www.bomtoon.com/api/balcony-api-v2/contents/tab/schedule/comic` +
    `?groupMenu=${day.key}` +
    `&isIncludeTen=false` +
    `&genres=${BOMTOON_GENRE_BL}` +
    `&sort=POPULAR` +
    `&adultToggle=true` +
    `&limit=100`;

  const res = await fetch(url, {
    headers: headers(),
    cache: "no-store",
  });

  const data = await res.json();

  console.log("[bomtoon ids]", day.label, data?.data?.length, data?.result, data?.error);

  if (data?.result !== "SUCCESS" || !Array.isArray(data?.data)) {
    console.error("[bomtoon schedule error]", day.label, data);
    return [];
  }

  return data.data;
}

async function fetchDetails(ids: number[]) {
  if (!ids.length) return [];

  const chunks: number[][] = [];

  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30));
  }

  const results = [];

  for (const chunk of chunks) {
    const res = await fetch(
      "https://www.bomtoon.com/api/balcony-api-v2/contents/tab/details",
      {
        method: "POST",
        headers: {
          ...headers(),
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          contentsIds: chunk.join(","),
          contentsThumbnailType: "VERTICAL,MAIN,SQUARE,VERTICAL_NON_ADULT",
        }),
        cache: "no-store",
      }
    );

    const data = await res.json();

    if (data?.result !== "SUCCESS") {
      console.error("[bomtoon details error]", data);
      continue;
    }

    if (Array.isArray(data?.data)) {
      results.push(...data.data);
    }
  }

  return results;
}

async function fetchDay(day: any) {
  const ids = await fetchIds(day);
  const details = await fetchDetails(ids);

  return details
    .map((item: any) => ({
      platform: "봄툰",
      day: day.label,
      title: item?.title || "",
      authors: getAuthors(item),
      schedule: day.label === "10일" ? "10일 주기" : day.label,
      url: item?.alias
        ? `https://www.bomtoon.com/detail/${item.alias}`
        : "https://www.bomtoon.com/bom/comic/weekly",
      cover: pickCover(item),
      isUp: Boolean(item?.badgeUp || item?.badge?.up),
    }))
    .filter((v: any) => v.title);
}

export async function GET() {
  try {
    const results = [];

    for (const day of DAYS) {
      const items = await fetchDay(day);
      results.push(...items);
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      webtoons: results,
      items: results,
    });
  } catch (error) {
    console.error("BOMTOON API ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        count: 0,
        webtoons: [],
        items: [],
      },
      { status: 500 }
    );
  }
}