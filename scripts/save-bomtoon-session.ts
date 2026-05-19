import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function main() {
  const storageDir = path.join(process.cwd(), ".storage");

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir);
  }

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext();

  const page = await context.newPage();

  console.log("봄툰 로그인 페이지 여는 중...");

  await page.goto("https://www.bomtoon.com/bom/comic/weekly", {
    waitUntil: "domcontentloaded",
  });

  console.log("");
  console.log("====================================");
  console.log("1. 봄툰 로그인");
  console.log("2. 성인 인증까지 완료");
  console.log("3. 완료되면 엔터 누르기");
  console.log("====================================");
  console.log("");

  process.stdin.resume();

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  const storagePath = path.join(storageDir, "bomtoon-auth.json");

  await context.storageState({
    path: storagePath,
  });

  console.log("");
  console.log("세션 저장 완료!");
  console.log(storagePath);

  await browser.close();
}

main();