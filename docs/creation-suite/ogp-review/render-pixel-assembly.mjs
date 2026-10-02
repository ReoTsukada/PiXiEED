import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const unit = 12;
const colors = { ink: '#17232d', blue: '#315fd0', red: '#e75445', yellow: '#f1c84b', green: '#51a876', aqua: '#49afc1', purple: '#8d73b4', white: '#ffffff' };
const cells = [];
const add = (column, row, color, group) => cells.push({ x: column * unit, y: row * unit, color: colors[color], group });
function mask(rows, x, y, group, colorAt, keep = () => true) {
  assert.ok(rows.every(row => row.length === rows[0].length), group + ': rectangular mask');
  for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
    if (rows[row][column] !== '.' && keep(column, row)) add(x + column, y + row, colorAt(column, row), group);
  }
}
const note = [
  '....#########', '....#########', '....##.....##', '....##.....##',
  '....##.....##', '....##.....##', '....##.....##', '....##.....##',
  '....##.....##', '.#####..#####', '######.######', '######.######', '.####...####.'
];
const noteColor = (x, y) => y < 9 ? (y === 0 && x > 7 ? 'aqua' : 'blue') : x < 7 ? 'red' : 'aqua';
const loose = [[0,0,'yellow'],[6,0,'red'],[2,2,'blue'],[8,3,'green'],[0,5,'red'],[5,5,'aqua'],[3,7,'purple'],[8,8,'yellow'],[1,10,'green'],[6,11,'blue'],[3,13,'red'],[8,13,'aqua']];
for (const [x, y, c] of loose) add(6 + x, 25 + y, c, 'loose');
mask(note, 18, 27, 'assembling', noteColor, (x, y) => y < 2 ? x % 3 !== 0 : y < 9 ? (x + y) % 3 !== 1 : (x + y) % 3 !== 0);
for (const [x,y,c] of [[17,26,'yellow'],[30,25,'aqua'],[29,32,'blue'],[17,36,'red'],[30,40,'green']]) add(x,y,c,'assembling-loose');
mask(note, 34, 25, 'music', noteColor);
const controller = [
  '....#########....', '..#############..', '.###############.',
  '#################', '#################', '#################',
  '######.....######', '#####.......#####', '####.........####', '###...........###'
];
mask(controller, 50, 28, 'controller', (x,y) => {
  if ((x === 4 && y >= 2 && y <= 4) || (y === 3 && x >= 3 && x <= 5)) return 'yellow';
  if (x === 12 && y === 2) return 'red';
  if (x === 14 && y === 3) return 'green';
  if (x === 12 && y === 4) return 'aqua';
  if (x === 10 && y === 3) return 'purple';
  if (y === 0 || y >= 6 || x === 0 || x === 16) return 'ink';
  return 'blue';
});
const puzzle = [
  '...###.....', '...###.....', '.########..', '.########..', '.########..',
  '.##########', '.##########', '.########..', '.##...###..', '.##...###..'
];
mask(puzzle, 71, 26, 'puzzle', (x,y) => y < 2 ? 'yellow' : x < 4 ? 'green' : 'aqua');
const camera = [
  '..####.....', '.#########.', '###########', '###.###.###',
  '##.#...#.##', '##.#.#.#.##', '##.#...#.##', '###.###.###', '.#########.'
];
mask(camera, 84, 26, 'camera', (x,y) => {
  if (y < 2) return 'yellow';
  if (y === 2 && x === 9) return 'red';
  if (y >= 3 && y <= 7 && x >= 3 && x <= 7) return 'aqua';
  return 'ink';
});
const painting = ['##########','##########','##########','##########','##########','##########','##########'];
mask(painting, 79, 40, 'painting', (x,y) => {
  if (x === 0 || x === 9 || y === 0 || y === 6) return 'purple';
  if (x >= 6 && y === 1) return 'yellow';
  if (y >= 4 && x <= 6) return 'green';
  if ((x >= 2 && x <= 4 && y >= 2) || (x >= 5 && x <= 7 && y >= 3)) return 'blue';
  return 'white';
});
for (const [x,y,c] of [[89,39,'red'],[90,40,'yellow'],[91,41,'yellow'],[92,42,'ink']]) add(x,y,c,'paint-pencil');
for (const cell of cells) {
  assert.ok(Number.isInteger(cell.x) && Number.isInteger(cell.y) && cell.x % unit === 0 && cell.y % unit === 0);
  assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + unit <= 1200 && cell.y + unit <= 630);
  assert.ok(cell.color);
}
assert.equal(new Set(cells.map(cell => `${cell.x},${cell.y}`)).size, cells.length, 'no overlapping cells');
const logo = (await readFile(resolve(directory, '../../../assets/brand/pixieed-logo-48.png'))).toString('base64');
const labels = [
  [126, 520, '四角'], [294, 520, '組み合わせ'], [486, 520, '音楽'], [702, 520, 'ゲーム'],
  [918, 464, 'パズル'], [1074, 444, '写真'], [1008, 600, '絵']
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
<title id="title">一つのドットから、ひろがる。ドットであそぼう</title>
<desc id="desc">カラフルな12ピクセルの正方形が、散らばった状態から組み合わさり、音符、パズル、ゲームのコントローラー、絵、カメラの形になるPiXiEEDのレビュー用OGP。</desc>
<style>text{font-family:"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;fill:#1b2025}.label{font-size:20px;font-weight:600;fill:#5f6871}.cell{shape-rendering:crispEdges}</style>
<rect width="1200" height="630" fill="#f7f8f6"/>
<rect x="72" y="48" width="48" height="48" fill="#17232d"/>
<image id="official-logo" x="72" y="48" width="48" height="48" href="data:image/png;base64,${logo}" style="image-rendering:pixelated"/>
<text id="brand" x="136" y="81" font-size="28" font-weight="800">PiXiEED</text>
<text id="domain" x="1128" y="81" font-size="22" text-anchor="end">pixieed.jp</text>
<text id="headline" x="72" y="176" font-size="52" font-weight="800">一つのドットから、ひろがる。</text>
<text id="subheadline" x="72" y="240" font-size="40" font-weight="700">ドットであそぼう</text>
<g id="pixel-icons">${cells.map(cell => `<rect class="cell" data-group="${cell.group}" x="${cell.x}" y="${cell.y}" width="12" height="12" fill="${cell.color}"/>`).join('\n')}</g>
<g id="labels">${labels.map(([x,y,label])=>`<text class="label" x="${x}" y="${y}" text-anchor="middle">${label}</text>`).join('\n')}</g>
</svg>\n`;
await writeFile(resolve(directory, 'ogp-pixel-assembly.svg'), svg);
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright entry module.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent(`<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  const textBounds = await page.locator('svg text').evaluateAll(elements => elements.map(element => {
    const b = element.getBBox(); return { text: element.textContent, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height };
  }));
  for (const b of textBounds) assert.ok(b.x >= 0 && b.y >= 0 && b.right <= 1200 && b.bottom <= 630, 'text contained: ' + b.text);
  assert.equal(await page.locator('#headline').textContent(), '一つのドットから、ひろがる。');
  assert.equal(await page.locator('#subheadline').textContent(), 'ドットであそぼう');
  await page.waitForFunction(() => document.querySelector('#official-logo').getBoundingClientRect().width === 48);
  await page.screenshot({ path: resolve(directory, 'ogp-pixel-assembly-1200x630.png') });
  const png = await readFile(resolve(directory, 'ogp-pixel-assembly-1200x630.png'));
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200,630]);
  const sampleChecks = await page.evaluate(async ({data,cells}) => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
    const c = canvas.getContext('2d'); c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0,0,1200,630).data; let checked = 0;
    for (const cell of cells) {
      const expected = [1,3,5].map(i => parseInt(cell.color.slice(i,i+2),16));
      for (let y=cell.y;y<cell.y+12;y++) for (let x=cell.x;x<cell.x+12;x++) {
        const offset=(y*1200+x)*4;
        if (expected.some((v,channel)=>pixels[offset+channel]!==v)||pixels[offset+3]!==255) throw new Error('Blended or misplaced cell at '+x+','+y);
        checked++;
      }
    }
    return checked;
  }, {data:'data:image/png;base64,'+png.toString('base64'),cells});
  await page.setViewportSize({ width: 600, height: 315 });
  await page.setContent(`<style>html,body{margin:0;width:600px;height:315px;overflow:hidden}img{display:block;width:600px;height:315px}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
  await page.locator('img').evaluate(image=>image.decode());
  await page.screenshot({path:resolve(directory,'ogp-pixel-assembly-preview-600x315.png')});
  await writeFile(resolve(directory, 'ogp-pixel-assembly-verification.json'), JSON.stringify({generatedAt:new Date().toISOString(),width:1200,height:630,unit,cellCount:cells.length,cellPixelChecks:sampleChecks,colors,copy:['一つのドットから、ひろがる。','ドットであそぼう'],textBounds,network:'blocked',status:'review_only'},null,2)+'\n');
  console.log(JSON.stringify({width:1200,height:630,unit,cells:cells.length,pixelChecks:sampleChecks,copy:'PASS',bounds:'PASS',preview:'600x315'}));
} finally {await browser.close();}
