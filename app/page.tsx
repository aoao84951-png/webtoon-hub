"use client";

import { useEffect, useMemo, useState } from "react";

type Webtoon = {
  platform: string;
  day: string;
  title: string;
  authors: string;
  schedule: string;
  url: string;
  cover?: string;
  isUp?: boolean;
  updatedAt?: string;
};

const DAYS = ["월", "화", "수", "목", "금", "토", "일", "10일"];
const PLATFORMS = ["전체", "리디", "레진코믹스", "봄툰", "미스터블루"];
const PAGE_SIZE = 30;
const CACHE_KEY = "webtoon-schedule-cache";

function getTodayKor() {
  return ["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()];
}

function formatToday() {
  const date = new Date();
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${getTodayKor()})`;
}

function isTenDayItem(item: Webtoon) {
  return (
    item.day === "10일" ||
    item.schedule?.includes("10일") ||
    /\d+\s*,\s*\d+.*일/.test(item.schedule ?? "")
  );
}

function getCycleText(item: Webtoon) {
  const text = item.schedule ?? "";
  const match = text.match(/(\d+\s*,\s*\d+\s*,?\s*\d*일)/);
  return match?.[1] ?? text.replace("10일 주기", "").trim();
}

function getPlatformClass(platform: string) {
  const clean = platform.replace(/\s/g, "");
  if (clean.includes("봄툰")) return "bomtoon";
  if (clean.includes("리디")) return "ridi";
  if (clean.includes("레진")) return "lezhin";
  if (clean.includes("미스터블루")) return "mrblue";
  return "default";
}

function platformMatch(itemPlatform: string, selectedPlatform: string) {
  if (selectedPlatform === "전체") return true;
  return itemPlatform
    .replace(/\s/g, "")
    .includes(selectedPlatform.replace(/\s/g, ""));
}

function WebtoonIcon() {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 11h24a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H20l-8 6v-6a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4z" />
      <path d="M18 23h12" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 10h6v28h-6z" />
      <path d="M23 10h6v28h-6z" />
      <path d="M34 12l5-1 5 27-5 1z" />
    </svg>
  );
}

export default function Home() {
  const [items, setItems] = useState<Webtoon[]>([]);
  const [selectedDay, setSelectedDay] = useState(getTodayKor());
  const [selectedPlatform, setSelectedPlatform] = useState("전체");
  const [selectedMenu, setSelectedMenu] = useState<"schedule" | "liked">(
    "schedule"
  );
  const [liked, setLiked] = useState<Webtoon[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  async function loadItems() {
    setRefreshing(true);
  
    const cached = localStorage.getItem(CACHE_KEY);
  
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
  
        if (Array.isArray(parsed?.items)) {
          setItems(parsed.items);
          setLoading(false);
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  
    try {
      const apis = ["/api/ridi", "/api/lezhin", "/api/bomtoon", "/api/mrblue"];
  
      const results = await Promise.allSettled(
        apis.map(async (api) => {
          const res = await fetch(`${api}?t=${Date.now()}`);
  
          if (!res.ok) {
            console.error(`${api} failed`, res.status);
            return [];
          }
  
          const data = await res.json();
          return data.items ?? data.webtoons ?? [];
        })
      );
  
      const merged = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );
  
      setItems(merged);
  
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          updatedAt: Date.now(),
          items: merged,
        })
      );
    } catch (error) {
      console.error("loadItems error:", error);
  
      if (!cached) {
        setItems([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setHasLoadedOnce(true);
    }
  }

  useEffect(() => {
    loadItems();

    const saved = localStorage.getItem("liked-webtoons");
    if (saved) setLiked(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("liked-webtoons", JSON.stringify(liked));
  }, [liked]);

  useEffect(() => {
    setPage(0);
  }, [selectedDay, selectedPlatform, selectedMenu]);

  function toggleLike(item: Webtoon) {
    setLiked((prev) => {
      const exists = prev.some((v) => v.url === item.url);
  
      if (exists) {
        return prev.filter((v) => v.url !== item.url);
      }
  
      return [...prev, item];
    });
  }

  const filteredItems = useMemo(() => {
    let base = items.filter((item) => {
      const dayOk =
        selectedMenu === "liked"
          ? true
          : selectedDay === "10일"
          ? isTenDayItem(item)
          : selectedDay === "완결"
          ? item.day === "완결"
          : item.day === selectedDay;

      return dayOk && platformMatch(item.platform, selectedPlatform);
    });

    if (selectedMenu === "liked") {
      base = liked.filter((item) =>
        platformMatch(item.platform, selectedPlatform)
      );
    }

    return base.sort((a, b) => {
      if (Number(b.isUp) !== Number(a.isUp)) {
        return Number(b.isUp) - Number(a.isUp);
      }

      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

      return bTime - aTime;
    });
  }, [items, selectedDay, selectedPlatform, selectedMenu, liked]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const visibleItems = filteredItems.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  return (
    <main className="page">
      <header className="top">
        <h1>{selectedMenu === "liked" ? "MY LIBRARY" : "WEBTOON SCHEDULE"}</h1>
      </header>

      {selectedMenu === "schedule" && (
        <nav className="day-tabs">
          {DAYS.map((day) => (
            <button
              key={day}
              className={`day-tab ${selectedDay === day ? "active" : ""}`}
              onClick={() => setSelectedDay(day)}
            >
              {day}
            </button>
          ))}
        </nav>
      )}

      <nav className={`platform-tabs ${selectedMenu === "liked" ? "library" : ""}`}>
        {PLATFORMS.map((platform) => (
          <button
            key={platform}
            className={`platform-tab ${
              selectedPlatform === platform ? "active" : ""
            }`}
            onClick={() => setSelectedPlatform(platform)}
          >
            {platform}
          </button>
        ))}
      </nav>

      <section className="section-head">
        <div>
          <h2>
            {selectedMenu === "liked"
              ? "내 서재"
              : selectedDay === "10일"
              ? "10일 주기 웹툰"
              : selectedDay === "완결"
              ? "완결 웹툰"
              : `${selectedDay}요일 웹툰`}
          </h2>

          <p>{formatToday()} · 총 {filteredItems.length}개</p>
        </div>
      </section>

      {loading || !hasLoadedOnce ? (
        <div className="empty">불러오는 중...</div>
      ) : refreshing && visibleItems.length === 0 ? (
        <div className="empty">불러오는 중...</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty">
          {selectedMenu === "liked"
            ? "찜한 작품이 없어요"
            : "등록된 웹툰이 없어요"}
        </div>
      ) : (
        <section className="cards">
          {visibleItems.map((item, index) => {
            const isLiked = liked.some((v) => v.url === item.url);

            return (
              <div
                key={`${item.platform}-${item.day}-${item.title}-${item.url}-${index}`}
                className="card-wrap"
              >
                <button
                  className={`like-button ${isLiked ? "liked" : ""}`}
                  onClick={() => toggleLike(item)}
                  aria-label="찜하기"
                >
                  ♥
                </button>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="card"
                >
                  <div className="cover">
                    {item.cover ? (
                      <img src={item.cover} alt={item.title} />
                    ) : (
                      <div className="no-cover">No Cover</div>
                    )}

                    {item.isUp && <span className="cover-up">UP</span>}

                    {isTenDayItem(item) && (
                      <span className="cycle">{getCycleText(item)}</span>
                    )}
                  </div>

                  <div className="info">
                    <h3>{item.title}</h3>

                    <p>{item.authors || "작가 정보 없음"}</p>

                    <div className="meta">
                      <span
                        className={`platform ${getPlatformClass(
                          item.platform
                        )}`}
                      >
                        {item.platform}
                      </span>
                      <span className="genre">BL</span>
                    </div>
                  </div>
                </a>
              </div>
            );
          })}
        </section>
      )}

      <nav className="pagination">
        {Array.from({ length: totalPages }).map((_, index) => (
          <button
            key={index}
            className={index === page ? "active" : ""}
            onClick={() => setPage(index)}
          >
            {index + 1}
          </button>
        ))}
      </nav>

      <button
        className="floating-refresh"
        onClick={loadItems}
        disabled={refreshing}
      >
        <span className={refreshing ? "spin" : ""}>↻</span>
      </button>

      <nav className="bottom-nav">
        <button
          className={selectedMenu === "schedule" ? "active" : ""}
          onClick={() => setSelectedMenu("schedule")}
        >
          <WebtoonIcon />
          <span>웹툰</span>
        </button>

        <button
          className={selectedMenu === "liked" ? "active" : ""}
          onClick={() => setSelectedMenu("liked")}
        >
          <LibraryIcon />
          <span>내 서재</span>
        </button>
      </nav>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #ffffff;
          padding: 34px 48px 150px;
          color: #333333;
          font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .top {
          max-width: 1240px;
          margin: 0 auto 24px;
        }

        h1 {
          margin: 0;
          color: #666666;
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .day-tabs {
          position: sticky;
          top: 0;
          z-index: 50;
          max-width: 1240px;
          margin: 0 auto 18px;
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          border-bottom: 1px solid #eeeeee;
          background: #ffffff;
          padding-top: 0;
          box-shadow: 0 8px 18px rgba(255, 255, 255, 0.95);
        }

        .day-tab {
          height: 58px;
          border: 0;
          border-bottom: 3px solid transparent;
          background: transparent;
          color: #aaaaaa;
          cursor: pointer;
          font: inherit;
          font-size: 20px;
          font-weight: 900;
        }

        .day-tab.active {
          color: #222222;
          border-bottom-color: #222222;
        }

        .platform-tabs {
          max-width: 1240px;
          margin: 0 auto 36px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .platform-tabs.library {
          margin-top: 4px;
        }

        .platform-tab {
          height: 32px;
          padding: 0 15px;
          border-radius: 999px;
          border: 1px solid #e5e5e5;
          background: #ffffff;
          color: #888888;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
        }

        .platform-tab.active {
          border-color: #777777;
          background: #f7f7f7;
          color: #333333;
        }

        .section-head {
          max-width: 1240px;
          margin: 0 auto 28px;
        }

        .section-head h2 {
          margin: 0;
          color: #444444;
          font-size: 24px;
          font-weight: 900;
        }

        .section-head p {
          margin: 8px 0 0;
          color: #999999;
          font-size: 13px;
          font-weight: 700;
        }

        .cards {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 26px 18px;
        }

        .card-wrap {
          position: relative;
        }

        .like-button {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          width: auto;
          height: auto;
          border: 0;
          background: transparent;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 0;
        }

        .like-button.liked {
          color: #ff5f9e;
        }

        .card {
          color: inherit;
          text-decoration: none;
          min-width: 0;
        }

        .cover {
          position: relative;
          width: 100%;
          aspect-ratio: 0.72 / 1;
          overflow: hidden;
          border-radius: 8px;
          background: #f5f5f5;
          border: 1px solid #eeeeee;
        }

        .cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.2s ease;
        }

        .card:hover .cover img {
          transform: scale(1.03);
        }

        .cover-up {
          position: absolute;
          left: 0;
          bottom: 0;
          z-index: 2;
          padding: 8px 11px;
          border-radius: 0 12px 0 0;
          background: #2ccfc9;
          color: #ffffff;
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
        }

        .cycle {
          position: absolute;
          left: 0;
          top: 0;
          z-index: 2;
          padding: 8px 11px;
          border-radius: 0 0 12px 0;
          background: rgba(47, 47, 47, 0.82);
          color: #ffffff;
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
        }

        .no-cover {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #aaaaaa;
          font-size: 12px;
          font-weight: 800;
        }

        .info {
          padding-top: 12px;
        }

        .info h3 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #333333;
          font-size: 15px;
          line-height: 1.25;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .info p {
          margin: 7px 0 0;
          color: #888888;
          font-size: 13px;
          font-weight: 700;
        }

        .meta {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .platform {
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
        }

        .platform.ridi {
          background: #e9eef7;
          color: #6d7f9f;
        }

        .platform.lezhin {
          background: #f5eaea;
          color: #9b7474;
        }

        .platform.bomtoon {
          background: #f6eaf0;
          color: #9b7485;
        }

        .platform.mrblue {
          background: #e9edf5;
          color: #737f9a;
        }

        .platform.default {
          background: #eeeeee;
          color: #888888;
        }

        .genre {
          color: #999999;
          font-size: 12px;
          font-weight: 800;
        }

        .pagination {
          max-width: 1240px;
          margin: 44px auto 0;
          display: flex;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pagination button {
          min-width: 34px;
          height: 34px;
          padding: 0 10px;
          border: 1px solid #e5e5e5;
          border-radius: 10px;
          background: #ffffff;
          color: #888888;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
        }

        .pagination button.active {
          border-color: #333333;
          background: #333333;
          color: #ffffff;
        }

        .empty {
          max-width: 1240px;
          min-height: 360px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999999;
          font-size: 15px;
          font-weight: 800;
        }

        .floating-refresh {
          position: fixed;
          right: 24px;
          bottom: 100px;
          z-index: 50;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1px solid #eeeeee;
          background: #ffffff;
          color: #555555;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
          cursor: pointer;
          font-size: 20px;
        }

        .bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          height: 52px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          background: #ffffff;
          border-top: 1px solid #eeeeee;
          box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.03);
        }

        .bottom-nav button {
          min-width: 0;
          border: 0;
          background: transparent;
          color: #9a9a9a;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
        }

        .bottom-nav button.active {
          color: #222222;
        }

        :global(.nav-icon) {
          width: 20px;
          height: 20px;
          display: block;
          fill: none !important;
          stroke: currentColor;
        }

        @media (max-width: 900px) {
          .page {
            padding: 24px 14px 78px;
          }

          .top {
            margin-bottom: 18px;
          }

          h1 {
            font-size: 20px;
          }

          .day-tabs {
            grid-template-columns: repeat(8, 1fr);
          }

          .day-tab {
            height: 44px;
            font-size: 13px;
          }

          .platform-tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            margin-bottom: 30px;
          }

          .platform-tabs::-webkit-scrollbar {
            display: none;
          }

          .platform-tab {
            flex: 0 0 auto;
            height: 30px;
            font-size: 11px;
          }

          .cards {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 20px 8px;
          }

          .like-button {
            top: 6px;
            right: 6px;
            font-size: 15px;
          }

          .cover {
            border-radius: 8px;
          }

          .cover-up {
            padding: 5px 8px;
            border-radius: 0 9px 0 0;
            font-size: 9px;
          }

          .cycle {
            left: 0;
            top: 0;
            padding: 5px 8px;
            border-radius: 0 0 9px 0;
            font-size: 9px;
          }

          .info {
            padding-top: 8px;
          }

          .info h3 {
            font-size: 11px;
          }

          .info p {
            font-size: 10px;
            line-height: 1.35;
          }

          .platform {
            padding: 3px 7px;
            font-size: 9px;
          }

          .genre {
            font-size: 9px;
          }

          .floating-refresh {
            right: 14px;
            bottom: 64px;
            width: 38px;
            height: 38px;
          }

          .bottom-nav {
            height: 50px;
          }

          :global(.nav-icon) {
            width: 19px;
            height: 19px;
          }
        }
      `}</style>
    </main>
  );
}