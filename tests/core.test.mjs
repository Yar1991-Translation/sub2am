import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Core from '../src/core/index.js';

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url));

test('core 导出完整且不依赖 DOM', () => {
  const names = [
    'decodeSubtitle', 'detectFormat', 'parseSRT', 'parseLRC', 'normalizeCues',
    'normalizeSettings', 'buildProject', 'computeGeometry', 'computeCueTransform',
    'estimateAdvanceUnits', 'escapeXmlText',
    'escapeXmlAttr', 'argbFromHexAndOpacity', 'formatTimecode', 'sanitizeBaseName'
  ];
  for (const name of names) assert.equal(typeof Core[name], 'function', name);
});

test('编码：UTF-8、BOM、GBK 与手动覆盖', () => {
  const enc = new TextEncoder();
  const plain = enc.encode('你好，世界！');
  const plainResult = Core.decodeSubtitle(plain, 'auto');
  assert.equal(plainResult.text, '你好，世界！');
  assert.equal(plainResult.encoding, 'utf-8');
  assert.equal(plainResult.hadBom, false);

  const withBom = new Uint8Array(plain.length + 3);
  withBom.set([0xEF, 0xBB, 0xBF], 0);
  withBom.set(plain, 3);
  const bomResult = Core.decodeSubtitle(withBom, 'auto');
  assert.equal(bomResult.text, '你好，世界！');
  assert.equal(bomResult.hadBom, true);

  const gbk = new Uint8Array(fixture('gbk-sample.srt'));
  const gbkResult = Core.decodeSubtitle(gbk, 'auto');
  assert.equal(gbkResult.encoding, 'gb18030');
  assert.match(gbkResult.text, /你好，世界！/);

  const forced = Core.decodeSubtitle(gbk, 'gb18030');
  assert.match(forced.text, /你好，世界！/);
  assert.equal(forced.usedOverride, true);

  const wrong = Core.decodeSubtitle(gbk, 'utf-8');
  assert.ok(wrong.replacements > 0, '用 UTF-8 读 GBK 应出现替换字符');

  const big5 = Uint8Array.from([0xA7, 0x41, 0xA6, 0x6E]);
  assert.equal(Core.decodeSubtitle(big5, 'big5').text, '你好');

  const sjis = Uint8Array.from([0x82, 0xB1, 0x82, 0xF1, 0x82, 0xC9, 0x82, 0xBF, 0x82, 0xCD]);
  assert.equal(Core.decodeSubtitle(sjis, 'shift_jis').text, 'こんにちは');

  const sjisLrc = new Uint8Array([...new TextEncoder().encode('[00:01.00]'), ...sjis]);
  const autoSjis = Core.decodeSubtitle(sjisLrc, 'auto');
  assert.equal(autoSjis.encoding, 'shift_jis');
  assert.equal(autoSjis.text, '[00:01.00]こんにちは');
});

test('格式识别', () => {
  assert.equal(Core.detectFormat('a.lrc', ''), 'lrc');
  assert.equal(Core.detectFormat('a.srt', ''), 'srt');
  assert.equal(Core.detectFormat('a.txt', '1\n00:00:01,000 --> 00:00:02,000\nHi'), 'srt');
  assert.equal(Core.detectFormat('a.txt', '[00:01.00]Hi'), 'lrc');
  assert.equal(Core.detectFormat('a.txt', '[ti:标题]\n[00:01.00]Hi'), 'lrc');
  assert.equal(Core.detectFormat('a.txt', '普通文本'), null);
});

test('SRT：多行、标签、实体、重叠、坏块与缺失空行', () => {
  const result = Core.parseSRT(fixture('messy.srt').toString('utf8'));
  assert.equal(result.cues.length, 6);
  assert.equal(
    JSON.stringify(result.cues.map((c) => [c.startMs, c.endMs])),
    JSON.stringify([[1000, 3500], [2000, 4000], [5500, 7250], [9000, 10000], [12000, 13000], [13000, 14000]])
  );
  assert.equal(result.cues[0].text, '第一行\n第二行 & 结尾');
  assert.equal(result.cues[1].text, '重叠字幕 测试');
  assert.equal(result.cues[2].text, '无序号 <tag> 与 ASS');
  assert.equal(result.cues[3].text, '换行\n测试');
  assert.equal(result.cues[4].text, '缺少空行直接接');
  assert.equal(result.cues[5].text, '下一条');

  const codes = result.warnings.map((w) => w.code);
  assert.ok(codes.includes('SRT_OVERLAP'), codes.join(','));
  assert.ok(codes.includes('SRT_BAD_TIMING'), codes.join(','));
  assert.ok(codes.includes('SRT_EMPTY_CUE'), codes.join(','));
  assert.ok(codes.includes('SRT_BAD_DURATION'), codes.join(','));

  const crlf = Core.parseSRT('1\r\n00:00:01,000 --> 00:00:02,000\r\n你好\r\n');
  assert.equal(crlf.cues.length, 1);
  assert.equal(crlf.cues[0].text, '你好');
});

test('LRC：offset、多时间戳、同起点合并、空边界与末句时长', () => {
  const result = Core.parseLRC(fixture('bilingual.lrc').toString('utf8'), { lastCueDurationMs: 3000 });
  assert.equal(result.cues.length, 6);
  assert.equal(
    JSON.stringify(result.cues.map((c) => [c.startMs, c.endMs])),
    JSON.stringify([[500, 2500], [2500, 5000], [5000, 7500], [7500, 10000], [10000, 11500], [12500, 15500]])
  );
  assert.equal(result.cues[0].text, '第一句');
  assert.equal(result.cues[1].text, '重复句');
  assert.equal(result.cues[2].text, '重复句');
  assert.equal(result.cues[3].text, '原文\nTranslation');
  assert.equal(result.cues[4].text, '逐字歌词');
  assert.equal(result.cues[5].text, '最后一句');
  assert.equal(result.meta.ti, '测试歌曲');
  assert.equal(result.meta.ar, '测试歌手');
  assert.ok(result.warnings.some((w) => w.code === 'LRC_OFFSET_APPLIED'));

  const clamped = Core.parseLRC('[offset:5000]\n[00:01.00]早到', { lastCueDurationMs: 1000 });
  assert.equal(clamped.cues[0].startMs, 0);
  assert.ok(clamped.warnings.some((w) => w.code === 'LRC_OFFSET_CLAMPED'));

  const duplicated = Core.parseLRC('[00:01.00]A\n[00:01.00]A\n[00:03.00]B', { lastCueDurationMs: 1000 });
  assert.equal(duplicated.cues[0].text, 'A');
});

test('LRC 逐字：单字保持到整行结束、累积与整行模式', () => {
  const text = fixture('perchar.lrc').toString('utf8');

  const karaoke = Core.parseLRC(text, { lastCueDurationMs: 1000, mode: 'karaoke' });
  assert.equal(karaoke.cues.length, 10);
  assert.equal(
    JSON.stringify(karaoke.cues.map((c) => [c.startMs, c.endMs])),
    JSON.stringify([
      [1000, 1500], [1500, 2000], [2000, 2500], [2500, 3000],
      [3000, 3500], [3500, 4000], [4000, 4500],
      [5000, 5500], [5500, 6000], [6000, 6500]
    ])
  );
  assert.equal(karaoke.cues[0].text, '私');
  assert.equal(karaoke.cues[1].text, '私の');
  assert.equal(karaoke.cues[6].text, '私の居ぬ将来に');
  assert.equal(karaoke.cues[7].text, '次');
  assert.equal(karaoke.cues[9].text, '次の行');

  // Default mode: one layer per character, all ending at the line end.
  const charsDefault = Core.parseLRC(text, { lastCueDurationMs: 1000 });
  assert.equal(charsDefault.cues.length, 10);
  assert.equal(charsDefault.cues[0].text, '私');
  assert.equal(charsDefault.cues[0].startMs, 1000);
  assert.equal(charsDefault.cues[0].endMs, 4500);
  assert.equal(charsDefault.cues[6].text, 'に');
  assert.equal(charsDefault.cues[6].startMs, 4000);
  assert.equal(charsDefault.cues[6].endMs, 4500);
  assert.equal(charsDefault.cues[7].text, '次');
  assert.equal(charsDefault.cues[7].startMs, 5000);
  assert.equal(charsDefault.cues[7].endMs, 6500);
  assert.equal(charsDefault.cues[9].text, '行');
  assert.equal(charsDefault.cues[9].endMs, 6500);
  assert.equal(charsDefault.cues[0].layout.totalUnits, 7);
  assert.equal(charsDefault.cues[0].layout.offsetUnits, 0);
  assert.equal(charsDefault.cues[0].layout.displayUnits, 1);
  assert.equal(charsDefault.cues[6].layout.offsetUnits, 6);
  assert.equal(charsDefault.cues[7].layout.totalUnits, 3);
  assert.equal(charsDefault.cues[9].layout.offsetUnits, 2);

  const chars = Core.parseLRC(text, { lastCueDurationMs: 1000, mode: 'chars' });
  assert.equal(chars.cues.length, 10);
  assert.equal(
    JSON.stringify(chars.cues.slice(0, 7).map((c) => [c.text, c.startMs, c.endMs])),
    JSON.stringify([
      ['私', 1000, 4500], ['の', 1500, 4500], ['居', 2000, 4500], ['ぬ', 2500, 4500],
      ['将', 3000, 4500], ['来', 3500, 4500], ['に', 4000, 4500]
    ])
  );
  assert.equal(chars.cues[7].text, '次');
  assert.equal(chars.cues[7].endMs, 6500);
  assert.equal(chars.cues[9].text, '行');
  assert.equal(chars.cues[9].endMs, 6500);

  const line = Core.parseLRC(text, { lastCueDurationMs: 1000, mode: 'line' });
  assert.equal(line.cues.length, 2);
  assert.equal(line.cues[0].text, '私の居ぬ将来に');
  assert.equal(line.cues[0].startMs, 1000);
  assert.equal(line.cues[0].endMs, 4500);
  assert.equal(line.cues[1].text, '次の行');
  assert.equal(line.cues[1].startMs, 5000);
  assert.equal(line.cues[1].endMs, 6500);
});

test('LRC 逐字：enhanced 词级标签与重复行时间戳', () => {
  const word = Core.parseLRC('[00:07.000]Hello <00:07.500>world', { lastCueDurationMs: 1000, mode: 'karaoke' });
  assert.equal(word.cues.length, 2);
  assert.equal(word.cues[0].text, 'Hello');
  assert.equal(word.cues[0].startMs, 7000);
  assert.equal(word.cues[0].endMs, 7500);
  assert.equal(word.cues[1].text, 'Hello world');
  assert.equal(word.cues[1].startMs, 7500);
  assert.equal(word.cues[1].endMs, 8500);

  const wordChars = Core.parseLRC('[00:07.000]Hello <00:07.500>world', { lastCueDurationMs: 1000 });
  assert.equal(wordChars.cues.length, 2);
  assert.equal(wordChars.cues[0].text, 'Hello');
  assert.equal(wordChars.cues[0].startMs, 7000);
  assert.equal(wordChars.cues[0].endMs, 8500);
  assert.equal(wordChars.cues[1].text, 'world');
  assert.equal(wordChars.cues[1].startMs, 7500);
  assert.equal(wordChars.cues[1].endMs, 8500);

  const wordLine = Core.parseLRC('[00:07.000]Hello <00:07.500>world', { lastCueDurationMs: 1000, mode: 'line' });
  assert.equal(wordLine.cues.length, 1);
  assert.equal(wordLine.cues[0].text, 'Hello world');
  assert.equal(wordLine.cues[0].startMs, 7000);
  assert.equal(wordLine.cues[0].endMs, 8500);

  const repeated = Core.parseLRC('[00:10.00][00:12.00]副歌\n[00:15.00]尾', { lastCueDurationMs: 1000 });
  assert.equal(repeated.cues.length, 3);
  assert.equal(repeated.cues[0].text, '副歌');
  assert.equal(repeated.cues[0].startMs, 10000);
  assert.equal(repeated.cues[0].endMs, 12000);
  assert.equal(repeated.cues[1].text, '副歌');
  assert.equal(repeated.cues[1].startMs, 12000);
  assert.equal(repeated.cues[1].endMs, 15000);
  assert.equal(repeated.cues[2].text, '尾');
  assert.equal(repeated.cues[2].startMs, 15000);
  assert.equal(repeated.cues[2].endMs, 16000);
});

test('单字自动排列：x 位置、字距微调与整行缩放', () => {
  const text = fixture('perchar.lrc').toString('utf8');
  const cues = Core.parseLRC(text, { lastCueDurationMs: 1000 }).cues;
  const settings = Core.normalizeSettings({
    width: 1080,
    height: 1920,
    fps: 60,
    bgColor: '#000000',
    font: 'Roboto',
    size: 28,
    scale: 1,
    color: '#FFFFFF',
    opacity: 100,
    align: 'center',
    position: 'bottom',
    marginPct: 15,
    wrapPct: 90,
    advanceFactorPct: 100,
    tailMs: 1000,
    lastCueDurationMs: 1000,
    shadow: false
  });
  const geo = Core.computeGeometry(settings);
  const first = Core.computeCueTransform(cues[0], settings, geo);
  assert.equal(Math.round(first.x), 288);
  assert.equal(Math.round(first.y), 1632);
  assert.equal(first.scale, 1);
  const seventh = Core.computeCueTransform(cues[6], settings, geo);
  assert.equal(Math.round(seventh.x), 792);
  const secondLineFirst = Core.computeCueTransform(cues[7], settings, geo);
  assert.equal(Math.round(secondLineFirst.x), 456);

  const compact = Core.normalizeSettings(Object.assign({}, settings, { advanceFactorPct: 50 }));
  const compactFirst = Core.computeCueTransform(cues[0], compact, geo);
  assert.equal(Math.round(compactFirst.x), 414);
  assert.equal(compactFirst.scale, 1);

  const longCue = {
    startMs: 0,
    endMs: 1000,
    text: '字',
    layout: { lineId: 0, offsetUnits: 0, displayUnits: 1, totalUnits: 20 }
  };
  const fit = Core.computeCueTransform(longCue, settings, geo);
  assert.ok(fit.scale < 1);
  assert.ok(Math.abs(fit.scale - 972 / (20 * 84)) < 1e-9);

  const out = Core.buildProject(settings, cues, 1700000000000);
  assert.ok(out.xml.includes('<location value="288.000000,1632.000000,0.000000" />'));
  assert.ok(out.xml.includes('<location value="792.000000,1632.000000,0.000000" />'));
  assert.ok(out.xml.includes('<location value="624.000000,1632.000000,0.000000" />'));

  const leftSettings = Core.normalizeSettings(Object.assign({}, settings, { align: 'left' }));
  const leftGeo = Core.computeGeometry(leftSettings);
  const leftFirst = Core.computeCueTransform(cues[0], leftSettings, leftGeo);
  assert.equal(Math.round(leftFirst.x), 96);
  const leftOut = Core.buildProject(leftSettings, cues, 1);
  assert.ok(leftOut.xml.includes('align="center"'));
});

test('几何：横屏/竖屏与三种垂直位置', () => {
  const bottom = Core.computeGeometry({ width: 1920, height: 1080, position: 'bottom', marginPct: 15, wrapPct: 90 });
  assert.equal(bottom.x, 960);
  assert.equal(bottom.y, 918);
  assert.equal(bottom.wrapWidth, 1728);

  const portrait = Core.computeGeometry({ width: 1080, height: 1920, position: 'bottom', marginPct: 15, wrapPct: 90 });
  assert.equal(portrait.x, 540);
  assert.equal(portrait.y, 1632);
  assert.equal(portrait.wrapWidth, 972);

  assert.equal(Core.computeGeometry({ width: 1920, height: 1080, position: 'middle', marginPct: 15, wrapPct: 90 }).y, 540);
  assert.equal(Core.computeGeometry({ width: 1920, height: 1080, position: 'top', marginPct: 15, wrapPct: 90 }).y, 162);
});

test('XML 生成：头部、颜色、转义、换行、id 与无多余节点', () => {
  const settings = Core.normalizeSettings({
    title: '测试 & <标题>',
    width: 1920,
    height: 1080,
    fps: 60,
    bgColor: '#000000',
    font: 'googlefonts?name=Roboto&weight=900',
    size: 28,
    scale: 1,
    color: '#FFFFFF',
    opacity: 50,
    align: 'center',
    position: 'bottom',
    marginPct: 15,
    wrapPct: 90,
    tailMs: 1000,
    fixedDurationMs: null,
    lastCueDurationMs: 3000,
    shadow: false
  });
  const cues = [
    { startMs: 2500, endMs: 4000, text: 'Hello' },
    { startMs: 0, endMs: 2500, text: 'A & B <tag>\n第二行' }
  ];
  const out = Core.buildProject(settings, cues, 1700000000000);

  assert.equal(out.totalTime, 5000);
  assert.equal(out.maxCueEndMs, 4000);
  assert.match(out.xml, /^<\?xml version='1\.0' encoding='UTF-8' \?>\n<scene /);
  assert.match(out.xml, /<scene title="测试 &amp; &lt;标题&gt;"/);
  assert.match(out.xml, /width="1920" height="1080" exportWidth="1920" exportHeight="1080"/);
  assert.match(out.xml, /bgcolor="#ff000000"/);
  assert.match(out.xml, /fillColor value="#80ffffff" \/>/);
  assert.match(out.xml, /font="googlefonts\?name=Roboto&amp;weight=900"/);
  assert.match(out.xml, /<content>A &amp; B &lt;tag&gt;\n第二行<\/content>/);
  assert.match(out.xml, /modifiedTime="1700000000000"/);
  assert.equal((out.xml.match(/<text /g) || []).length, 2);
  assert.match(out.xml, /<text id="1" label="字幕 001 A &amp; B &lt;tag&gt;" startTime="0" endTime="2500"/);
  assert.match(out.xml, /<text id="2" label="字幕 002 Hello"/);

  for (const bad of ['<kf', '<effect', '<audio', '<media', '<bookmark', '<shadow']) {
    assert.equal(out.xml.includes(bad), false, bad);
  }
});

test('透明背景写入 scene bgcolor', () => {
  const transparent = Core.normalizeSettings({ bgTransparent: true });
  const out = Core.buildProject(transparent, [{ startMs: 0, endMs: 1000, text: 'Hi' }], 1);
  assert.equal(transparent.bgTransparent, true);
  assert.ok(out.xml.includes('bgcolor="#00000000"'));

  const opaque = Core.normalizeSettings({ bgTransparent: false, bgColor: '#112233' });
  const out2 = Core.buildProject(opaque, [{ startMs: 0, endMs: 1000, text: 'Hi' }], 1);
  assert.ok(out2.xml.includes('bgcolor="#ff112233"'));
});

test('固定总时长与阴影', () => {
  const base = {
    title: 't', width: 1920, height: 1080, fps: 60, bgColor: '#000000',
    font: 'Roboto', size: 28, scale: 1, color: '#FFFFFF', opacity: 100,
    align: 'center', position: 'bottom', marginPct: 15, wrapPct: 90,
    tailMs: 1000, lastCueDurationMs: 3000, shadow: true
  };
  const cues = [{ startMs: 0, endMs: 4000, text: 'Hi' }];
  const short = Core.buildProject(Core.normalizeSettings(Object.assign({}, base, { fixedDurationMs: 3000 })), cues, 1);
  assert.equal(short.totalTime, 4000);
  assert.ok(short.warnings.some((w) => w.code === 'FIXED_DURATION_SHORT'));
  assert.match(short.xml, /<shadow direction="outside" enabled="true">/);

  const fixed = Core.buildProject(Core.normalizeSettings(Object.assign({}, base, { fixedDurationMs: 8000 })), cues, 1);
  assert.equal(fixed.totalTime, 8000);
  assert.equal(fixed.warnings.length, 0);
});

test('颜色、时间、文件名与 XML 清洗辅助函数', () => {
  assert.equal(Core.argbFromHexAndOpacity('#ffffff', 100), '#ffffffff');
  assert.equal(Core.argbFromHexAndOpacity('#ff0000', 50), '#80ff0000');
  const shortHex = Core.normalizeColor('#abc');
  assert.equal(shortHex.r, 170);
  assert.equal(shortHex.g, 187);
  assert.equal(shortHex.b, 204);
  assert.equal(shortHex.a, 255);
  assert.equal(Core.sanitizeXmlChars('a\u0000b\u0007c\uD800d'), 'abcd');
  assert.equal(Core.escapeXmlText('&<>"\''), '&amp;&lt;&gt;"\'');
  assert.equal(Core.escapeXmlAttr('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
  assert.equal(Core.escapeXmlText('😀'), '😀');
  assert.equal(Core.formatTimecode(0), '00:00.000');
  assert.equal(Core.formatTimecode(3723456), '1:02:03.456');
  assert.equal(Core.baseNameOf('C:\\x\\字幕.srt'), '字幕');
  assert.equal(Core.baseNameOf('/tmp/demo.lrc'), 'demo');
  assert.equal(Core.sanitizeBaseName('a:b/c'), 'a b c');
  assert.equal(Core.sanitizeBaseName(''), 'sub2am');
});

test('设置校验会拒绝非法值', () => {
  assert.throws(() => Core.normalizeSettings({ size: 0 }), /字号/);
  assert.throws(() => Core.normalizeSettings({ width: 10 }), /画布宽度/);
  assert.throws(() => Core.normalizeSettings({ font: '   ' }), /字体/);
  assert.throws(() => Core.normalizeSettings({ fps: 59 }), /FPS/);
  assert.throws(() => Core.normalizeSettings({ color: 'nope' }), /文字颜色/);
  assert.throws(() => Core.normalizeSettings({ advanceFactorPct: 10 }), /字距微调/);
  assert.throws(() => Core.buildProject(Core.normalizeSettings({}), [], 1), /没有字幕/);
});
