/**
 * make-sprite.js
 * 개별 PNG 프레임 → sprite.png 스프라이트 시트 생성
 *
 * 레이아웃:
 *   row 0: idle  (idle_1.png, idle_2.png)
 *   row 1: click (jump_1.png, jump_2.png, jump_3.png)
 *
 * 사용: node make-sprite.js
 */

const Jimp = require("jimp");
const path = require("path");

const ASSETS = path.join(__dirname, "assets/frog");
const OUTPUT = path.join(ASSETS, "sprite.png");

const ROWS = [
  ["idle_1.png", "idle_2.png"],           // row 0 — idle
  ["jump_1.png", "jump_2.png", "jump_3.png"], // row 1 — click
];

async function main() {
  // 첫 프레임으로 기준 크기 결정
  const first = await Jimp.read(path.join(ASSETS, ROWS[0][0]));
  const fw = first.bitmap.width;
  const fh = first.bitmap.height;

  const cols = Math.max(...ROWS.map((r) => r.length));
  const sheet = new Jimp(fw * cols, fh * ROWS.length, 0x00000000);

  for (let row = 0; row < ROWS.length; row++) {
    for (let col = 0; col < ROWS[row].length; col++) {
      const frame = await Jimp.read(path.join(ASSETS, ROWS[row][col]));
      sheet.composite(frame, col * fw, row * fh);
    }
  }

  await sheet.writeAsync(OUTPUT);

  console.log(`✓ sprite.png 생성 완료`);
  console.log(`  크기: ${fw * cols} × ${fh * ROWS.length}px`);
  console.log(`  프레임: ${fw}×${fh}px`);
  console.log(`  row 0 — idle  : ${ROWS[0].length}프레임`);
  console.log(`  row 1 — click : ${ROWS[1].length}프레임`);
}

main().catch((err) => {
  console.error("오류:", err.message);
  process.exit(1);
});
