// HTML 덱의 각 슬라이드를 16:9 이미지로 촬영한다.
// PPT에서 디자인을 흉내내면 폰트·여백·그라데이션이 어긋난다. 브라우저 렌더 결과를 그대로 쓰는 이유다.
//
// 사용: node scripts/deck/shoot-slides.mjs <deckUrl> <outDir>
import { chromium } from "../../front/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const [deckUrl, outDir] = process.argv.slice(2);
if (!deckUrl || !outDir) {
  console.error("사용법: node scripts/deck/shoot-slides.mjs <deckUrl> <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
// 1600x900 = 16:9. deviceScaleFactor 2로 찍어야 PPT 전체화면에서 텍스트가 뭉개지지 않는다.
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(deckUrl, { waitUntil: "networkidle" });

const count = await page.locator("section.slide").count();
for (let i = 0; i < count; i++) {
  const slide = page.locator("section.slide").nth(i);
  // 리빌 애니메이션(IntersectionObserver)이 걸려 있어, 뷰포트에 넣고 전환이 끝난 뒤 찍는다.
  await slide.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  // PNG로 찍으면 덱 하나가 15MB까지 커진다. JPEG 88이면 4MB대에 화질 손실이 눈에 띄지 않는다.
  await slide.screenshot({
    path: `${outDir}/slide-${String(i + 1).padStart(2, "0")}.jpg`,
    type: "jpeg",
    quality: 88,
  });
}

await browser.close();
console.log(`${count}장 촬영 → ${outDir}`);
