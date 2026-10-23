export const DEFAULT_SETTINGS = Object.freeze({
  title: '字幕',
  width: 1920,
  height: 1080,
  fps: 60,
  bgColor: '#000000',
  bgTransparent: false,
  font: 'googlefonts?name=Roboto&weight=900',
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
  fixedDurationMs: null,
  lastCueDurationMs: 3000,
  shadow: false
});

// Project header values taken from the user's Alight Motion 5.0.273 export.
export const SCENE_VERSION = Object.freeze({
  precompose: 'dynamicResolution',
  amver: '1028425',
  ffver: '106',
  am: 'com.alightcreative.motion/5.0.273.1028425',
  amplatform: 'android',
  retime: 'freeze',
  retimeAdaptFPS: 'false'
});
