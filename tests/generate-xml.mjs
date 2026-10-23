import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Core from '../src/core/index.js';

const fixtureText = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const outDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const FIXED_MODIFIED_TIME = 1700000000000;

function build(name, settingsRaw, cues) {
  const settings = Core.normalizeSettings(settingsRaw);
  const out = Core.buildProject(settings, cues, FIXED_MODIFIED_TIME);
  writeFileSync(outDir + name, out.xml, 'utf8');
  console.log(name + ' texts=' + cues.length + ' totalTime=' + out.totalTime + ' warnings=' + out.warnings.length);
}

const srt = Core.parseSRT(fixtureText('messy.srt'));
build('landscape-srt.xml', {
  title: 'messy',
  width: 1920,
  height: 1080,
  fps: 60,
  bgColor: '#000000',
  font: 'googlefonts?name=Roboto&weight=900',
  size: 28,
  scale: 1,
  color: '#FFFFFF',
  opacity: 100,
  align: 'center',
  position: 'bottom',
  marginPct: 15,
  wrapPct: 90,
  tailMs: 1000,
  fixedDurationMs: null,
  lastCueDurationMs: 3000,
  shadow: false
}, srt.cues);

const lrc = Core.parseLRC(fixtureText('bilingual.lrc'), { lastCueDurationMs: 3000 });
build('portrait-lrc.xml', {
  title: 'bilingual',
  width: 1080,
  height: 1920,
  fps: 60,
  bgColor: '#000000',
  font: 'googlefonts?name=Roboto&weight=900',
  size: 28,
  scale: 1,
  color: '#FFFFFF',
  opacity: 100,
  align: 'center',
  position: 'bottom',
  marginPct: 15,
  wrapPct: 90,
  tailMs: 1000,
  fixedDurationMs: null,
  lastCueDurationMs: 3000,
  shadow: false
}, lrc.cues);

const perchar = Core.parseLRC(fixtureText('perchar.lrc'), { lastCueDurationMs: 3000, mode: 'karaoke' });
build('perchar-karaoke.xml', {
  title: 'perchar',
  width: 1080,
  height: 1920,
  fps: 60,
  bgColor: '#000000',
  font: 'googlefonts?name=Roboto&weight=900',
  size: 28,
  scale: 1,
  color: '#FFFFFF',
  opacity: 100,
  align: 'center',
  position: 'bottom',
  marginPct: 15,
  wrapPct: 90,
  tailMs: 1000,
  fixedDurationMs: null,
  lastCueDurationMs: 3000,
  shadow: false
}, perchar.cues);

const percharChars = Core.parseLRC(fixtureText('perchar.lrc'), { lastCueDurationMs: 3000 });
build('perchar-chars.xml', {
  title: 'perchar-chars',
  width: 1080,
  height: 1920,
  fps: 60,
  bgColor: '#000000',
  font: 'googlefonts?name=Roboto&weight=900',
  size: 28,
  scale: 1,
  color: '#FFFFFF',
  opacity: 100,
  align: 'center',
  position: 'bottom',
  marginPct: 15,
  wrapPct: 90,
  tailMs: 1000,
  fixedDurationMs: null,
  lastCueDurationMs: 3000,
  shadow: false
}, percharChars.cues);
