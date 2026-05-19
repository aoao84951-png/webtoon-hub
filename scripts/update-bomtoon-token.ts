import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();

  let foundToken = "";

  page.on("request", (request) => {
    const headers = request.headers();
    const auth = headers.authorization || headers.Authorization;

    if (auth?.startsWith("Bearer ")) {
      foundToken = auth.replace(/^Bearer\s+/i, "").trim();
    }
  });

  await page.goto("https://www.bomtoon.com/bom/comic/weekly", {
    waitUntil: "domcontentloaded",
  });

  console.log("");
  console.log("봄툰 로그인 후, 19세 BL 작품 또는 주간 BL 페이지를 몇 번 눌러줘.");
  console.log("토큰이 잡히면 자동으로 .env.local에 저장할게.");
  console.log("");

  for (let i = 0; i < 60; i += 1) {
    if (foundToken) break;
    await page.waitForTimeout(1000);
  }

  if (!foundToken) {
    console.log("토큰을 찾지 못했어. 봄툰에서 로그인 후 작품/주간 탭을 다시 눌러봐.");
    await browser.close();
    process.exit(1);
  }

  let env = "";

  if (fs.existsSync(ENV_PATH)) {
    env = fs.readFileSync(ENV_PATH, "utf-8");
  }

  if (env.includes("BOMTOON_AUTH_TOKEN=")) {
    env = env.replace(
      /BOMTOON_AUTH_TOKEN=.*/g,
      `BOMTOON_AUTH_TOKEN=${foundToken}`
    );
  } else {
    env += `\nBOMTOON_AUTH_TOKEN=${foundToken}\n`;
  }

  fs.writeFileSync(ENV_PATH, env.trim() + "\n");

  console.log("");
  console.log("BOMTOON_AUTH_TOKEN 저장 완료!");
  console.log(".env.local이 갱신됐어.");

  await browser.close();
}

main();