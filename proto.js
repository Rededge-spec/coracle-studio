/*PROTO-BEGIN*/
/* ---------------------------------------------------------------- protocol --- */
const HDR = [0x7D, 0x46, 0x4C];
const CMD = { INFO: 1, GET: 2, SET: 3, DUMP: 4, DESC: 5, STEP_GET: 6, STEP_SET: 7, PRESET: 8, PROJECT: 9, NAMES: 10,
  SMP_BEGIN: 11, SMP_WRITE: 12, SMP_END: 13, SMP_ERASE: 14, SMP_INFO: 15,
  UP_LIST: 16, UP_GET: 17, UP_PUT: 18, UP_STORE: 19, UP_LOAD: 20, UP_ERASE: 21,
  WATCH: 22, CHANGED: 23, RELOAD: 24, PING: 25, STEP_CHANGED: 26,
  TRACK: 27, TRACK_MIX: 28, TRACK_DUMP: 29, TRACK_STEP: 30,
  TRACK_PARAM: 31, TRACK_CHANGED: 32, SONG: 33,
  UI_STATE: 34, UI_SET: 35, UI_PALETTES: 36, FAV_GET: 37, FAV_SET: 38, COLORS: 39,
  MOTION: 64, BACKUP_LIST: 65, BACKUP_GET: 66, BACKUP_PUT: 67,
  FM6_GET: 68, FM6_PUT: 69, FM6_LIST: 70, FM6_ERASE: 71, MENU_DESC: 72, MENU_SET: 73, KIT_GET: 74, KIT_PUT: 75, TRANSPORT: 76, PROJ_NAME: 77, POOL: 78, LIST: 79, PERFORM: 80,
  SMP_MIX: 81, LIST2: 82 };
/* frames the device sends on its own (while WATCH is on); never replies */
const PUSH = new Set([CMD.CHANGED, CMD.RELOAD, CMD.STEP_CHANGED, CMD.TRACK_CHANGED]);
/* user preset bank: name 1..12 printable ASCII, a 16-step pattern of (note, flags 1 acc 2 slide 4 tie) */
const UP = { NAME_MAX: 12, PAT: 16, LIST_MAX: 16 };
const PAT_REST = 65;                              /* (#28) LIST: an entry that is a REST (patterns 1..64, 0 empty) */
const F = { INT: 0, PCT: 1, BIPCT: 2, TIME: 3, LFOHZ: 4, CUTOFF: 5, DB: 6, SEMI: 7, ENUM: 8, BPM: 9, NOTE: 10, ONOFF: 11, OCT: 12, STEPS: 13, ST16: 14 };
/* (Skiff #27) THEME CUSTOM: the colours a set holds (COLORS, cmd 39), each theme's own to start from (tools/gen_ui_palettes.py:
   BG SURF TEXT THEME ACCENT, then the six tracks', RGB565; test_web.mjs checks them against build/gen/ui_palettes.h), the
   tokens the editor wears while CUSTOM is in use, and the contrast it warns by (WCAG; below the generator's minimums, so
   no theme of the device's warns). After Felucca 1.6's custom palette (palette.js, Leo Kuroshita) */
const PAL_ROLES = ["BG", "SURF", "TEXT", "THEME", "ACCENT", "T1", "T2", "T3", "T4", "T5", "T6"];
const PAL_BUILTIN = [
  ["SKIFF", 0x0841, 0x18c3, 0xffdf, 0xffdf, 0xffdf, 0xfac6, 0x2616, 0xfde0, 0x941f, 0xfb75, 0xa726],
  ["HI-CON", 0x0000, 0x2945, 0xffdf, 0xff40, 0x073f, 0xff40, 0xff40, 0xff40, 0xff40, 0xff40, 0xff40],
  ["PAPER", 0xf77c, 0xe6d9, 0x20e3, 0x0aa8, 0xa9c1, 0x0aa8, 0x0aa8, 0x0aa8, 0x0aa8, 0x0aa8, 0x0aa8],
  ["CRYPT", 0x0820, 0x20c2, 0xeeb5, 0xfd84, 0xfeef, 0xeb66, 0xf5a7, 0xde74, 0xeac8, 0xad6b, 0xcc36],
  ["NEON", 0x0823, 0x1866, 0xf77f, 0xfad7, 0x371f, 0xfa16, 0x371f, 0xfeeb, 0xfc07, 0xab3f, 0x57f5],
  ["QUARK", 0x0021, 0x08a4, 0xdf9f, 0x4e9f, 0xff0c, 0xfaac, 0x46f0, 0x5c7f, 0x3efe, 0xe31c, 0xfeea],
].map(([name, ...c]) => ({ name, c }));
const rgb8 = (c) => [(c >> 11) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];   /* (as the generator's) */
const hex565 = (c) => "#" + rgb8(c).map((x) => x.toString(16).padStart(2, "0")).join("");
const from565hex = (s) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(s));
  return m ? (parseInt(m[1], 16) >> 3) << 11 | (parseInt(m[2], 16) >> 2) << 5 | parseInt(m[3], 16) >> 3 : 0;
};
/* gfx.c ux_mix: a + (b - a) * pct / 100 per channel, rounded half away from zero; ux_luma: 0..255 */
const mix565 = (a, b, pct) => [[11, 31], [5, 63], [0, 31]].reduce((o, [sh, mk]) => {
  const x = (a >> sh) & mk, d = (((b >> sh) & mk) - x) * pct;
  return o | (x + Math.trunc((d + (d >= 0 ? 50 : -50)) / 100)) << sh;
}, 0);
const luma565 = (c) => { const [r, g, b] = rgb8(c); return (r * 54 + g * 183 + b * 19) >> 8; };
const contrast565 = (a, b) => {
  const lum = (c) => rgb8(c).map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/* [role, on role, the least contrast]: words, values and curves, the one active thing, a lane (and its number on it) */
const PAL_RULE = [[2, 0, 4.5], [2, 1, 4.5], [3, 0, 3], [4, 0, 3], ...[5, 6, 7, 8, 9, 10].map((k) => [k, 0, 3])];   /* (symmetric) */
const colorWarnings = (c) => PAL_RULE.map(([a, b, min]) => ({ a: PAL_ROLES[a], b: PAL_ROLES[b], r: contrast565(c[a], c[b]), min }))
  .filter((x) => x.r < x.min);
/* the editor in THEME CUSTOM: its tokens from the set (as the device derives its own: MID and DIM from BG to TEXT, a
   raised tile SURF to TEXT); the look's faces stay data-theme's */
const customTokens = (c) => {
  const light = luma565(c[0]) > 128;
  return { "--bg": hex565(c[0]), "--tile": hex565(c[1]), "--raise": hex565(mix565(c[1], c[2], 8)),
    "--hover": hex565(mix565(c[1], c[2], 16)), "--fg": hex565(c[2]), "--dim": hex565(mix565(c[0], c[2], 62)),
    "--line": hex565(mix565(c[0], c[2], 42)), "--head": hex565(c[3]), "--on-trk": hex565(c[0]),
    "--txmix": light ? "62%" : "100%", "color-scheme": light ? "light" : "dark",
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((k) => [`--t${k}`, hex565(c[4 + k])])) };
};

const v14enc = (v) => { const u = Math.max(-8192, Math.min(8191, Math.round(v))) + 8192; return [u & 0x7F, (u >> 7) & 0x7F]; };
const v14dec = (lo, hi) => (lo | (hi << 7)) - 8192;
function strEnc(s) { const a = []; for (const c of String(s)) a.push(c.charCodeAt(0) & 0x7F); a.push(0); return a; }

/* only ever builds F0 7D 46 4C ... F7 */
function frame(cmd, args = []) {
  for (const b of args) if (!(Number.isInteger(b) && b >= 0 && b <= 0x7F)) throw new Error("bad data byte " + b);
  return [0xF0, ...HDR, cmd & 0x7F, ...args, 0xF7];
}
/* -> {cmd, a} or null when it is not an editor frame */
function unframe(d) {
  if (!d || d.length < 6 || d[0] !== 0xF0 || d[d.length - 1] !== 0xF7) return null;
  if (d[1] !== HDR[0] || d[2] !== HDR[1] || d[3] !== HDR[2]) return null;
  return { cmd: d[4], a: Array.from(d.slice(5, d.length - 1)) };
}

/* the DRUM grid (firmware v5): a step's lane hits and their accents, bit l = lane l. Each lane plays its GM note
   (eng_drum.c DRUM_LANE_NOTE) on any engine; LANE_OF: the lane a GM note 35..81 strikes (drum_lane; others fold
   to their octave of 36..47) */
const LANES = ["KICK", "SNARE", "CLAP", "HATCL", "HATOP", "TOM", "RIM", "BELL"];
const LANE_NOTE = [36, 38, 39, 42, 46, 45, 37, 56];
const LANE_OF = "00612153535455757773777675555555773366336665577";
const LANE_ALIAS = { CONGA: 5, CLAVE: 6, CYM: 7, BD: 0, SD: 1, CP: 2, CH: 3, OH: 4 };
const drumLane = (n) => +LANE_OF[(n >= 35 && n <= 81 ? n : 36 + ((n + 120 - 36) % 12)) - 35];
/* the lanes a step strikes (its hits, its notes on their lanes) and which are accented (step_lanes / step_accents) */
const stepLanes = (s) => (s.time !== 0 ? 0 : s.notes.slice(0, s.n).reduce((m, n) => m | (1 << drumLane(n)), s.hit | 0));
const stepAccents = (s) => (s.flags & 1 ? stepLanes(s) : (s.acc | 0) & stepLanes(s));
/* hits as text, an accent marked ">" ("KICK >SNARE HATCL"), and back: null when a word is not a lane */
const hitsText = (hit, acc) => LANES.map((nm, l) => (hit >> l & 1 ? (acc >> l & 1 ? ">" : "") + nm : "")).filter(Boolean).join(" ");
function parseHits(text) {
  let hit = 0, acc = 0;
  for (const w of String(text).toUpperCase().split(/[\s,]+/).filter(Boolean)) {
    const a = w.startsWith(">"), nm = a ? w.slice(1) : w, l = LANES.includes(nm) ? LANES.indexOf(nm) : LANE_ALIAS[nm];
    if (l == null) return null;
    hit |= 1 << l;
    if (a) acc |= 1 << l;
  }
  return { hit, acc };
}
/* the 3 bytes after a step (v5): hit & 127, acc & 127, bit 7 of each; an older firmware's step has none (0) */
const hitsEnc = (hit, acc) => [hit & 0x7F, acc & 0x7F, (hit >> 7 & 1) | (acc >> 7 & 1) << 1];
/* (Skiff W3) the mock device's MENU settings, as Skiff's firmware has them (menu_items.c; test_web.mjs checks them against
   tests/editor_test.c's menu.json): id, name, value names (THEME: the palettes), default, the device's tab */
const MENU_TABS = ["DISPLAY", "CONTROL", "AUDIO", "SYSTEM"];
const MENU = [
  { id: 0, name: "THEME", names: null, def: 0, tab: 0 }, { id: 2, name: "LARGE", names: ["OFF", "ON"], def: 0, tab: 0 },
  { id: 3, name: "ANIM", names: ["ON", "OFF"], def: 0, tab: 0 }, { id: 4, name: "LEDS", names: ["OFF", "DIM LO", "DIM HI", "INV"], def: 2, tab: 0 },
  { id: 5, name: "HOLD", names: ["0.3 s", "0.4 s", "0.5 s", "0.6 s"], def: 1, tab: 1 }, { id: 6, name: "KNOB ACCEL", names: ["OFF", "ON"], def: 0, tab: 1 },
  { id: 8, name: "BPM LOCK", names: ["OFF", "ON"], def: 0, tab: 1 }, { id: 9, name: "SPEAKER EQ", names: ["FLAT", "LOWCUT", "BASS+"], def: 0, tab: 2 },
  { id: 10, name: "USB LEVEL", names: ["MASTER", "FIXED"], def: 0, tab: 2 }, { id: 11, name: "USB SERIAL", names: ["ON", "OFF"], def: 0, tab: 3 },
  { id: 12, name: "CLICK", names: ["OFF", "REC", "ON"], def: 0, tab: 2 }, { id: 13, name: "CLICK LEVEL", names: ["LOW", "MID", "HIGH"], def: 1, tab: 2 },
  { id: 14, name: "COUNT-IN", names: ["OFF", "1 BAR", "2 BARS"], def: 0, tab: 2 }, { id: 15, name: "RESTORE LAST", names: ["ON", "OFF"], def: 0, tab: 3 },
  { id: 16, name: "SCALE LEDS", names: ["OFF", "ON"], def: 0, tab: 1 },
  { id: 17, name: "SCREEN OFF", names: ["NEVER", "5 MIN", "15 MIN", "30 MIN", "60 MIN"], def: 3, tab: 0 },
  { id: 19, name: "PLAYHEAD", names: ["THEME", "LINE"], def: 0, tab: 0 },   /* ((Skiff #27) HOME's figure at the playhead, or the line) */
  { id: 20, name: "RETURN", names: ["SNAP", "1 BEAT", "1 BAR"], def: 2, tab: 1 }];   /* ((2.0) how MOMENTARY, FX's macros, throws come back) */
/* (Skiff W1) a step's trig condition (core.h TC_NAME; INFO 43 01 says how many) */
const TC_NAMES = ["--", "FILL", "!FILL", "1:2", "2:2", "1:3", "2:3", "3:3", "1:4", "2:4", "3:4", "4:4"];
/* (Skiff W3) the DRUM-X kit: the factory's (drumx_voice.c DX_KIT_INIT: {mode, A, B}, A and B PITCH P MOD DECAY NOISE
   COLOR; test_web.mjs checks it against the firmware's), its lanes, the mode's names (ui_dx.c), its values */
const DX_KIT_DEF = [[16, [9, 70, 72, 4, 20], [14, 100, 88, 10, 60]], [5, [40, 30, 52, 80, 90], [46, 18, 64, 104, 70]],
  [4, [60, 0, 46, 127, 84], [54, 0, 58, 127, 76]], [10, [100, 0, 22, 96, 116], [108, 0, 14, 112, 122]],
  [10, [100, 0, 62, 96, 112], [108, 0, 74, 112, 118]], [16, [30, 40, 66, 10, 30], [36, 60, 76, 20, 50]],
  [27, [63, 10, 14, 16, 46], [70, 24, 20, 30, 60]], [6, [69, 0, 72, 0, 40], [74, 0, 84, 12, 56]]];
/* (Skiff phase 9) the factory kits a DRUM-X preset loads as the project's kit (eng_drumx.c DX_KITS: 0 the factory's,
   then the kits of FACTORY KIT on) and each preset's kit + 1 (DRUMX_PKIT; 0 keeps the kit); test_web.mjs checks both */
const DX_KITS = [DX_KIT_DEF,
  [[48, [6, 60, 84, 2, 10], [10, 80, 92, 4, 30]], [4, [36, 20, 60, 90, 60], [40, 28, 70, 100, 70]], [4, [56, 0, 52, 127, 70], [52, 0, 64, 127, 64]], [10, [92, 0, 18, 100, 104], [96, 0, 24, 110, 110]], [10, [92, 0, 70, 100, 100], [96, 0, 84, 110, 106]], [48, [22, 50, 80, 6, 20], [28, 70, 92, 10, 40]], [27, [58, 8, 16, 10, 40], [62, 16, 22, 20, 50]], [6, [64, 0, 80, 0, 36], [70, 0, 92, 10, 48]]],
  [[16, [16, 100, 60, 10, 40], [20, 120, 68, 20, 70]], [9, [60, 10, 40, 70, 110], [66, 0, 46, 90, 120]], [8, [70, 0, 30, 127, 100], [66, 0, 40, 127, 96]], [10, [116, 0, 8, 60, 124], [120, 0, 12, 80, 127]], [10, [116, 0, 40, 60, 120], [120, 0, 50, 80, 124]], [17, [40, 60, 36, 0, 50], [46, 80, 44, 0, 70]], [27, [80, 20, 8, 0, 60], [86, 30, 10, 10, 80]], [5, [88, 0, 30, 0, 80], [92, 0, 40, 0, 90]]],
  [[145, [10, 90, 70, 20, 70], [14, 110, 80, 30, 100]], [134, [44, 30, 50, 100, 80], [50, 40, 60, 110, 90]], [6, [64, 0, 46, 120, 90], [60, 0, 56, 124, 84]], [138, [104, 0, 20, 110, 116], [110, 0, 28, 120, 122]], [10, [104, 0, 72, 110, 112], [110, 0, 84, 120, 118]], [18, [28, 50, 60, 20, 60], [34, 70, 72, 30, 80]], [151, [70, 20, 20, 30, 70], [76, 30, 26, 40, 90]], [7, [60, 10, 90, 10, 60], [66, 20, 94, 20, 74]]],
  [[16, [12, 40, 76, 0, 4], [14, 54, 86, 2, 14]], [0, [42, 10, 46, 60, 50], [44, 16, 56, 70, 56]], [0, [60, 0, 40, 127, 60], [58, 0, 50, 127, 56]], [6, [90, 0, 16, 100, 90], [94, 0, 22, 110, 96]], [6, [90, 0, 60, 100, 86], [94, 0, 70, 110, 92]], [16, [32, 20, 60, 4, 10], [36, 30, 70, 8, 20]], [20, [66, 4, 12, 20, 40], [70, 8, 16, 30, 50]], [4, [78, 0, 60, 0, 20], [80, 0, 72, 4, 30]]],
  [[81, [12, 80, 56, 10, 60], [18, 110, 64, 20, 90]], [69, [50, 60, 40, 90, 100], [58, 80, 48, 100, 110]], [10, [76, 20, 30, 110, 110], [70, 30, 40, 120, 104]], [74, [110, 30, 10, 80, 120], [118, 50, 14, 90, 126]], [11, [108, 20, 44, 80, 116], [114, 30, 52, 90, 122]], [65, [36, 90, 40, 10, 80], [44, 110, 48, 20, 100]], [91, [84, 40, 10, 30, 80], [90, 60, 14, 40, 100]], [101, [72, 50, 50, 0, 90], [80, 70, 60, 10, 100]]],
  [[48, [14, 50, 80, 0, 20], [18, 64, 90, 4, 30]], [20, [46, 40, 50, 40, 50], [50, 50, 58, 50, 60]], [4, [58, 0, 40, 127, 72], [54, 0, 48, 127, 66]], [6, [96, 0, 14, 110, 100], [100, 0, 18, 120, 106]], [6, [96, 0, 40, 110, 96], [100, 0, 50, 120, 102]], [48, [30, 60, 70, 4, 24], [36, 80, 80, 8, 34]], [23, [74, 10, 18, 4, 50], [78, 16, 22, 10, 60]], [7, [76, 0, 70, 0, 40], [80, 0, 80, 4, 50]]],
  [[16, [10, 110, 70, 0, 30], [14, 127, 80, 6, 50]], [101, [50, 70, 50, 80, 90], [56, 90, 60, 90, 100]], [4, [62, 0, 44, 127, 86], [58, 0, 54, 127, 80]], [10, [106, 0, 14, 90, 120], [110, 0, 18, 100, 124]], [10, [106, 0, 56, 90, 116], [110, 0, 64, 100, 120]], [112, [40, 100, 60, 0, 40], [48, 120, 70, 0, 60]], [121, [90, 90, 20, 0, 80], [96, 110, 26, 0, 100]], [96, [70, 127, 50, 0, 40], [80, 127, 60, 0, 60]]]];
const DRUMX_PKIT = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const DX = { lanes: ["KICK", "SNARE", "CLAP", "CL HAT", "OP HAT", "TOM", "RIM", "BELL"], waves: ["SINE", "FM", "METAL", "BELL"],
  filters: ["LP", "BP", "HP"], shapes: ["DECAY", "LONG", "NOISE", "SINE"], values: ["PITCH", "P MOD", "DECAY", "NOISE", "COLOR"] };
function readHits(r, o) {
  o.hit = 0; o.acc = 0;
  if (r.i + 3 <= r.a.length) { const h = r.b(), c = r.b(), x = r.b(); o.hit = h | (x & 1) << 7; o.acc = (c | (x & 2) << 6) & o.hit; }
  o.chance = r.i < r.a.length ? r.b() : 100;
  if (o.chance > 100) throw new Error("Invalid step chance");
  o.ratchet = r.i < r.a.length ? r.b() : 1;       /* RATCH (INFO 52 01): the step's hits 1..4; older firmware: 1 */
  if (o.ratchet < 1 || o.ratchet > 4) throw new Error("Invalid step ratchet");
  o.flam = r.i < r.a.length ? r.b() : 0;          /* (Skiff W1, INFO 43 01) FLAM, COND, NUDGE + 32; older firmware: none */
  o.cond = r.i < r.a.length ? r.b() : 0;
  o.nudge = (r.i < r.a.length ? r.b() : 32) - 32;
  o.ties = r.i < r.a.length ? r.b() : 0;          /* ((2.0, #25, INFO 57 01 bit 6) bit k: note k goes on from the step before */
  if (o.flam > 1 || o.cond >= TC_NAMES.length || o.nudge > 31 || o.ties > 15) throw new Error("Invalid step extras");
  return o;
}

class Reader {
  constructor(a) { this.a = a; this.i = 0; }
  b() { if (this.i >= this.a.length) throw new Error("short reply"); return this.a[this.i++]; }
  v() { const lo = this.b(); return v14dec(lo, this.b()); }
  s() { let s = ""; for (;;) { const c = this.b(); if (!c) return s; s += String.fromCharCode(c); } }
}

const parse = {
  [CMD.INFO](a) {
    const r = new Reader(a);
    const o = { version: r.s(), nengines: r.b(), pcount: r.b(), gcount: r.b(), nstep: r.b(), pe0: r.b(), engines: [] };
    for (let i = 0; i < o.nengines; i++) o.engines.push(r.s());
    o.chainRows = 0;
    o.ntrk = r.i < a.length ? r.b() : 0;             /* v3: tracks (0 = older firmware, one instrument) */
    o.uiCaps = 0;
    const trailer = a.slice(r.i);
    if (trailer[0] === 16) o.chainRows = 16;       /* existing v6 SONG capability */
    if (trailer.length >= 4 && trailer[0] === 16 && trailer[1] === 0x55 && trailer[2] === 1)
      o.uiCaps = trailer[3] & 31;                 /* tagged preferences; never interpret old PR bytes as SONG ((Skiff #27)
                                                     bit 4: COLORS) */
    o.motionMax = 0; o.chance = false; o.backupCaps = 0;
    if (o.uiCaps && trailer[4] === 0x4d && trailer[5] === 1 && trailer[6] === 64) {
      o.motionMax = 64; o.chance = trailer[7] === 1;
      if (trailer[8] === 0x42 && trailer[9] === 1) o.backupCaps = trailer[10] & 3;
    }
    o.fm6 = null;                                 /* FM6 patches (cmds 68..71): the factory and bank slot counts */
    o.syncCaps = 0;                               /* live sync: bit 0 WATCH while on keeps pending pushes, bit 1 no RELOAD */
    o.ratchet = 0;                                /* a step's ratchet (STEP_SET's byte after the chance), 0 = none */
    o.stepx = 0;                                  /* (Skiff W1) a step's FLAM, COND, NUDGE after it: the COND count, 0 = none */
    o.locks = false;                              /* (1.1, INFO 4C 01) MOTION ops 5..7: locks, their kinds */
    o.menuCount = 0;                              /* (1.0.4, INFO 4E 01 count) the MENU settings MENU_DESC offers */
    o.kitLanes = 0;                               /* (Skiff W3, INFO 4B 01 8) KIT_GET / KIT_PUT: the DRUM-X kit's lanes */
    o.skiff = 0;                                  /* (Skiff W3, INFO 57 01 caps) bits: 0 TRANSPORT, 1 PROJ_NAME, 2 POOL, 3 LIST,
                                                     4 PERFORM, (#21) 5 SMP_MIX, (2.0, #25) 6 a step's ties */
    o.song2 = 0;                                  /* (2.0, INFO 58 01 caps) bit 0: LIST2, NEW, COPY+, CHAIN, ONCE, the pool's
                                                     EMPTY and CLEAR UNUSED */
    for (const p of [8, 11]) if (o.motionMax && trailer[p] === 0x46 && trailer[p + 1] === 1) {   /* for the editor's */
      o.fm6 = { factory: trailer[p + 2], bank: trailer[p + 3], caps: 0 };                         /* PRESET / G_ENGSEL */
      if (trailer[p + 4] === 0x53 && trailer[p + 5] === 1) o.syncCaps = trailer[p + 6] & 3;
      /* FM6 v2 (1.0.3): bit 0 no bank (SLOT F1..F8, 8 = OWN), bit 1 the user presets carry their patch (target 3) */
      if (trailer[p + 7] === 0x50 && trailer[p + 8] === 1) o.fm6.caps = trailer[p + 9] & 3;
      let r = trailer[p + 7] === 0x50 ? p + 10 : p + 7;                                   /* RATCH after FM6 v2 */
      if (trailer[r] === 0x4E && trailer[r + 1] === 1) { o.menuCount = trailer[r + 2]; r += 3; }   /* and the MENU settings (1.0.4) */
      if (o.syncCaps && trailer[r] === 0x52 && trailer[r + 1] === 1) o.ratchet = trailer[r + 2];   /* RATCH: max hits */
      if (trailer[r] === 0x52 && trailer[r + 1] === 1) r += 3;
      if (trailer[r] === 0x4C && trailer[r + 1] === 1) { o.locks = true; r += 3; }        /* parameter locks (1.1) */
      if (trailer[r] === 0x54 && trailer[r + 1] === 1) {                                  /* (Skiff phase 6) the light */
        o.light = { tracks: trailer[r + 2], engines: trailer[r + 3] | trailer[r + 4] << 7 | trailer[r + 5] << 14 };   /* tracks */
        r += 6;
      }
      if (trailer[r] === 0x43 && trailer[r + 1] === 1) { o.stepx = trailer[r + 2]; r += 3; }   /* (Skiff W1) FLAM COND NUDGE */
      if (trailer[r] === 0x4B && trailer[r + 1] === 1) { o.kitLanes = trailer[r + 2]; r += 3; }   /* (Skiff W3) the DRUM-X kit */
      if (trailer[r] === 0x57 && trailer[r + 1] === 1) { o.skiff = trailer[r + 2] & 127; r += 3; }   /* (Skiff W3) TRANSPORT .. (2.0) ties */
      if (trailer[r] === 0x49 && trailer[r + 1] === 1) {                                  /* (Skiff 1.3) wide ids: */
        o.pcount = trailer[r + 2] | trailer[r + 3] << 7;                                 /* P_COUNT and P_E0 whole */
        o.pe0 = trailer[r + 4] | trailer[r + 5] << 7;
        r += 6;
      }
      if (trailer[r] === 0x58 && trailer[r + 1] === 1) o.song2 = trailer[r + 2] & 127;   /* (2.0) the song's, last */
    }
    o.light = o.light || { tracks: 0, engines: 0 };   /* the tracks that may not play some engines, and those engines */
    return o;
  },
  [CMD.UI_STATE](a) {
    const r = new Reader(a), o = { caps: r.b(), palette: r.b(), font: r.b(), monitor: r.b(), filter: r.b() };
    const u28 = () => r.b() | r.b() << 7 | r.b() << 14 | r.b() << 21;
    o.favoriteSig = u28(); o.bankSig = u28(); return o;
  },
  [CMD.UI_SET](a) { const r = new Reader(a); return { rc: r.b(), id: r.b(), value: r.b(), ...parse[CMD.UI_STATE](a.slice(3)) }; },
  [CMD.UI_PALETTES](a) { const r = new Reader(a), n = r.b(); return Array.from({ length: n }, () => r.s()); },
  /* (Skiff #27) COLORS: rc, flags (bit 0 a set stored, bit 1 in use), its look, then pack7 of the set's 22 bytes: PAL_ROLES
     as RGB565, low byte first */
  [CMD.COLORS](a) {
    const raw = unpack7(a.slice(3));
    return { rc: a[0], stored: !!(a[1] & 1), active: !!(a[1] & 2), look: a[2],
      c: Array.from({ length: raw.length >> 1 }, (_, i) => raw[2 * i] | raw[2 * i + 1] << 8) };
  },
  [CMD.FAV_GET](a) {
    const r = new Reader(a), rc = r.b(); if (rc) return { rc };
    const o = { rc, engine: r.b(), start: r.v(), count: r.b() };
    o.values = Array.from({ length: o.count }, () => !!r.b()); return o;
  },
  [CMD.FAV_SET](a) {
    const r = new Reader(a), rc = r.b();
    return rc === 0 || rc === 3 || rc === 4 ? { rc, engine: r.b(), preset: r.v(), on: !!r.b() } : { rc };
  },
  [CMD.GET](a) { const r = new Reader(a); return { ...widIn(r.b(), r.b()), value: r.v() }; },
  [CMD.SET](a) { return parse[CMD.GET](a); },
  /* needs the counts from INFO */
  [CMD.DUMP](a, info) {
    const r = new Reader(a);
    const o = { engine: r.b(), preset: r.b(), p: [], g: [] };
    for (let i = 0; i < info.pcount; i++) o.p.push(r.v());
    for (let i = 0; i < info.gcount; i++) o.g.push(r.v());
    return o;
  },
  [CMD.DESC](a) {
    const r = new Reader(a);
    const o = { ...widIn(r.b(), r.b()), fmt: r.b(), min: r.v(), max: r.v(), def: r.v(), label: r.s(), unit: r.s(), names: [] };
    if (o.fmt === F.ENUM) for (let i = 0; i <= o.max - o.min && i < 24; i++) o.names.push(r.s());
    return o;
  },
  [CMD.STEP_GET](a) {
    const r = new Reader(a);
    const o = { index: r.b(), n: r.b(), notes: [r.b(), r.b(), r.b(), r.b()], time: r.b(), flags: r.b(), vel: r.b() };
    return readHits(r, o);
  },
  [CMD.STEP_SET](a) { return parse[CMD.STEP_GET](a); },
  [CMD.PRESET](a) { const r = new Reader(a); return { engine: r.b(), preset: r.b() }; },
  /* (Skiff W3) MENU_DESC: index, id (127: past the list), kind (0 names, 1 a number), value, min, max, name, the names (0)
     or a unit (1); (1.0.5) the device's tab and its name (older: tab -1) */
  [CMD.MENU_DESC](a) {
    const r = new Reader(a), o = { index: r.b(), id: r.b() };
    if (o.id === 127) return o;
    Object.assign(o, { kind: r.b(), value: r.v(), min: r.v(), max: r.v(), name: r.s(), names: null, unit: "", tab: -1, tabName: "" });
    if (o.kind === 0) { o.names = []; for (let i = 0; i <= o.max - o.min; i++) o.names.push(r.s()); }
    else o.unit = r.s();
    if (r.i < a.length) { o.tab = r.b(); o.tabName = r.s(); }
    return o;
  },
  [CMD.MENU_SET](a) { const r = new Reader(a); return { rc: r.b(), id: r.b(), value: r.v() }; },
  /* (Skiff W3) a DRUM-X kit lane: lane, wave, filter, snap, pitch mod (shape), drive, A's five values, B's five */
  [CMD.KIT_GET](a) {
    const r = new Reader(a), o = { lane: r.b(), wave: r.b(), filt: r.b(), snap: !!r.b(), pmod: r.b(), drive: !!r.b() };
    o.a = [0, 1, 2, 3, 4].map(() => r.b()); o.b = [0, 1, 2, 3, 4].map(() => r.b());
    return o;
  },
  [CMD.KIT_PUT](a) { return parse[CMD.KIT_GET](a); },
  /* (Skiff W3) TRANSPORT: rc, playing, counting in, the request the audio has yet to take (1 start, 2 stop, 3 restart),
     the armed tracks (a bit each), the selected track */
  [CMD.TRANSPORT](a) {
    const r = new Reader(a);
    const o = { rc: r.b(), playing: !!r.b(), counting: !!r.b(), pending: r.b(), rec: r.b(), sel: r.b(), steps: null };
    if (a.length >= 12) { o.steps = []; while (r.i < a.length) { const s = r.b(); o.steps.push(s === 127 ? null : s); } }   /* (Coracle 0.9.7) each track's step playing */
    return o;
  },
  /* (Skiff W3) PROJ_NAME: op, rc (0 done, 1 refused, 2 failed), the music's slot (-1: none), changed since, its name,
     each slot: used, its name */
  [CMD.PROJ_NAME](a) {
    const r = new Reader(a), o = { op: r.b(), rc: r.b(), cur: r.b(), changed: !!r.b(), name: r.s() };
    if (o.cur === 127) o.cur = -1;
    o.slots = [0, 1, 2, 3].map(() => ({ used: !!r.b(), name: r.s() }));
    return o;
  },
  /* (Skiff W3) POOL: op, rc (0 cleared, 1 nothing to clear, 2 in use, 3 playing, 4 failed), each pattern: LEN (0 empty),
     what uses it */
  [CMD.POOL](a) {
    const r = new Reader(a), o = { op: r.b(), rc: r.b(), pats: [] };
    for (let i = 0; i < 64; i++) o.pats.push({ len: r.b(), refs: r.b() });
    return o;
  },
  /* (Skiff W3) LIST: op, rc (0 done, 1 empty, 2 without its automation, 3 playing, 4 PATTERNS FULL, 5 failed), SONG, each
     track: the entry it is on, the one staged (-1: none), its pattern (0..63, -1 none), its 16 entries (pattern 1..64,
     (#28) PAT_REST a REST, 0 empty; REPS 1..16). (2.0) LIST2 the same, SONG 0..2 (2 ONCE) and a REPS byte 16 an entry on
     CHAIN (chain: its REPS 1); ((#30) snd: INFO 58 01 bit 1, each entry's sound after it, [0 none; 1..63 an engine + 1,
     its preset; 64 + a user slot, 0]) */
  [CMD.LIST](a, two = false, snd = false) {
    const r = new Reader(a), o = { op: r.b(), rc: r.b(), song: two ? r.b() : +!!r.b(), tracks: [] }, n = (v) => (v === 127 ? -1 : v);
    while (r.i < a.length) {
      const x = { cur: n(r.b()), next: n(r.b()), pat: n(r.b()), ent: [] };
      for (let e = 0; e < 16; e++) {
        const p = r.b(), v = r.b(), chain = two && v === 16;
        x.ent.push({ pat: p, reps: chain ? 1 : (v & 15) + 1, chain, snd: snd ? [r.b(), r.b()] : [0, 0] });
      }
      o.tracks.push(x);
    }
    return o;
  },
  [CMD.LIST2](a, snd = false) { return parse[CMD.LIST](a, true, snd); },
  /* (Skiff W3) PERFORM: op, rc, LAUNCH (0 LOOP .. 3 NOW), the scene last recalled or stored (-1 none), the scenes kept
     (a bit each), each track: muted, its mute staged (0 none, 1 to unmute, 2 to mute) */
  [CMD.PERFORM](a) {
    const r = new Reader(a), o = { op: r.b(), rc: r.b(), launch: r.b(), last: r.b(), scenes: 0, tracks: [] };
    if (o.last === 127) o.last = -1;
    o.scenes = r.b() | r.b() << 7 | r.b() << 14;
    while (r.i < a.length) o.tracks.push({ muted: !!r.b(), staged: r.b() });
    return o;
  },
  [CMD.PROJECT](a) { const r = new Reader(a); return { op: r.b(), slot: r.b(), used: r.b() }; },
  [CMD.SONG](a) {
    const r = new Reader(a);
    const o = { op: r.b(), rc: r.b(), count: r.b(), playing: r.b(), row: r.b(), remaining: r.b(), rows: [] };
    for (let i = 0; i < o.count; i++) o.rows.push({ slot: r.b(), repeat: r.b() });
    return o;
  },
  [CMD.MOTION](a) {
    const r = new Reader(a), o = { track: r.b(), rc: r.b(), on: !!r.b(), count: r.b(), max: r.b(), events: [] };
    const kinds = o.count > 0 && a.length === 5 + o.count * 5;   /* (1.1: after ops 5..7, a kind per record: 0 automation, 1 lock;
                                                                 * none to say with none) */
    if (o.count > o.max || o.max !== 64 || (a.length !== 5 + o.count * 4 && !kinds)) throw new Error("Invalid motion reply");
    for (let i = 0; i < o.count; i++) { const s = r.b(); o.events.push({ step: s & 63, param: r.b() | (s >> 6 & 1) << 7, value: r.v() }); }   /* ((1.3) bit 6:
                                                                 the id's bit 7) */
    o.kinds = kinds;
    if (kinds) o.events.forEach((e) => { e.lock = r.b() === 1; });
    return o;
  },
  [CMD.NAMES](a) {
    const r = new Reader(a);
    const o = { engine: r.b(), names: [] };
    const n = r.b();
    for (let i = 0; i < n; i++) o.names.push(r.s());
    o.titles = [];
    try { o.titles.push(r.s(), r.s()); } catch (e) { o.titles = []; }   /* older firmware: no page titles */
    return o;
  },
  [CMD.SMP_BEGIN](a) { const r = new Reader(a); return { slot: r.b(), rc: r.b() }; },
  [CMD.SMP_WRITE](a) { const r = new Reader(a); return { slot: r.b(), offset: r.b() | (r.b() << 7) | (r.b() << 14), rc: r.b() }; },
  [CMD.SMP_END](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.SMP_ERASE](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.SMP_INFO](a) {
    const r = new Reader(a);
    const o = { nslots: r.b(), slotKiB: r.b(), slots: [] };
    for (let i = 0; i < o.nslots; i++) o.slots.push({ zones: r.b(), name: r.s(), kib: r.b() });
    return o;
  },
  /* (#21) slot, rc (0, 1 nothing set: an empty slot, 2 set but not kept: the sample fills the slot), each sound's keys,
     then LEVEL x 16, REV x 16, DLY x 16 (0..127) -> {slot, rc, keys: [[lo, hi]], mix: [[LEVEL, REV, DLY]] per sound} */
  [CMD.SMP_MIX](a) {
    const r = new Reader(a), o = { slot: r.b(), rc: r.b(), keys: [], mix: [] }, n = r.b();
    for (let i = 0; i < n; i++) o.keys.push([r.b(), r.b()]);
    const v = Array.from({ length: 48 }, () => r.b());
    for (let i = 0; i < n; i++) o.mix.push([v[i], v[16 + i], v[32 + i]]);
    return o;
  },
  [CMD.UP_LIST](a) {
    const r = new Reader(a);
    const o = { start: r.b(), count: r.b(), total: r.b(), slots: [] };
    for (let i = 0; i < o.count; i++) o.slots.push({ slot: o.start + i, used: r.b(), engine: r.b(), name: r.s() });
    return o;
  },
  /* needs P_COUNT from INFO */
  [CMD.UP_GET](a, info) {
    const r = new Reader(a);
    const o = { slot: r.b(), used: r.b(), engine: r.b(), name: r.s(), p: [], pattern: [] };
    for (let i = 0; i < info.pcount; i++) o.p.push(r.v());
    for (let i = 0; i < UP.PAT; i++) o.pattern.push([r.b(), r.b()]);
    o.grid = null;                                   /* v5: kind 1 = a drum grid (the pairs its low 7 bits), 16 x hi */
    if (r.i < a.length && r.b() === 1 && r.i + UP.PAT <= a.length) {
      o.grid = o.pattern.map(([h, c]) => { const x = r.b(), hit = h | (x & 1) << 7; return [hit, (c | (x & 2) << 6) & hit]; });
      o.pattern = null;
    }
    return o;
  },
  [CMD.UP_PUT](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.UP_STORE](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.UP_LOAD](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.UP_ERASE](a) { return parse[CMD.SMP_BEGIN](a); },
  [CMD.WATCH](a) { return { on: new Reader(a).b() }; },
  [CMD.CHANGED](a) { return parse[CMD.GET](a); },
  [CMD.RELOAD](a) { const r = new Reader(a); return { engine: r.b(), preset: r.b(), track: r.i < a.length ? r.b() : 0 }; },
  [CMD.PING](a) { return {}; },
  [CMD.STEP_CHANGED](a) { const r = new Reader(a); return { index: r.b(), track: r.i < a.length ? r.b() : 0 }; },
  /* v3: tracks (1.0: four synth parts; earlier firmware: track 4 the drum part, engine byte NENGINES) */
  [CMD.TRACK](a) {
    const r = new Reader(a);
    const o = { sel: r.b(), ntrk: r.b(), tracks: [] };
    for (let i = 0; i < o.ntrk; i++) o.tracks.push({ engine: r.b(), preset: r.b(), level: r.v(), mute: r.b(), armed: r.b() });
    return o;
  },
  [CMD.TRACK_MIX](a) { const r = new Reader(a); return { track: r.b(), level: r.v(), mute: r.b() }; },
  [CMD.TRACK_DUMP](a, info) {
    const r = new Reader(a);
    const o = { track: r.b(), engine: r.b(), preset: r.b(), p: [] };
    for (let i = 0; i < info.pcount; i++) o.p.push(r.v());
    return o;
  },
  [CMD.TRACK_STEP](a) {
    const r = new Reader(a);
    return readHits(r, { track: r.b(), index: r.b(), n: r.b(), notes: [r.b(), r.b(), r.b(), r.b()], time: r.b(), flags: r.b(), vel: r.b() });
  },
  /* v4: a parameter of any track (the selection stays), and its push for a track that is not selected */
  [CMD.TRACK_PARAM](a) { const r = new Reader(a), t = r.b(); return { track: t & 63, id: r.b() | (t >> 6 & 1) << 7, value: r.v() }; },   /* ((1.3)
                                                    bit 6 of the track byte: the id's bit 7) */
  [CMD.TRACK_CHANGED](a) { return parse[CMD.TRACK_PARAM](a); },
  /* FM6 patches: target 0 a track, 1 the bank (retired in 1.0.3: rc 3), 2 a factory patch, 3 a user preset's patch
     (INFO fm6.caps bit 1); packed: the 128-byte record */
  [CMD.FM6_GET](a) { return { target: a[0], index: a[1], rc: a[2], packed: a[2] ? null : a.slice(3, 3 + 128) }; },
  [CMD.FM6_PUT](a) { return { target: a[0], index: a[1], rc: a[2] }; },
  [CMD.FM6_LIST](a) {
    const r = new Reader(a), o = { factory: r.b(), bank: r.b(), slots: [] };
    for (let i = 0; i < o.factory + o.bank; i++) { const used = r.b(); o.slots.push({ used: !!used, name: r.s() }); }
    return o;
  },
  [CMD.FM6_ERASE](a) { return { index: a[0], rc: a[1] }; },
};
/* ((2.0, #30) a Song tab reply (request r) as device d sends it: LIST2's with each entry's sound when INFO 58 01 has bit 1) */
const songReply = (d, r, a) => (r[0] === CMD.LIST2 ? parse[CMD.LIST2](a, !!(d.info.song2 & 2)) : parse[r[0]](a));

/* a name the device accepts: printable ASCII, 1..12 characters */
/* (Skiff W3) a project's name as the device keeps it: upper case, printable ASCII, 12 at most ("" = none) */
function cleanProjName(s) { return String(s ?? "").toUpperCase().replace(/[^\x20-\x7E]/g, "").trim().slice(0, 12); }
function upName(s) { return String(s ?? "").replace(/[^\x20-\x7E]/g, "").trim().slice(0, UP.NAME_MAX) || "PATCH"; }

/* (Skiff 1.3, EDITOR_PROTOCOL.md "Wide ids") a track parameter from 128 on goes out as scope 2, id - 128, and comes back
   so: the editor keeps scope 0 and the whole id */
const widOut = (scope, id) => (scope === 0 && id >= 128 ? [2, id - 128] : [scope, id]);
const widIn = (scope, id) => (scope === 2 ? { scope: 0, id: id + 128 } : { scope, id });
const req = {
  uiState: () => [CMD.UI_STATE, []],
  uiSet: (id, value) => [CMD.UI_SET, [id, value]],
  uiPalettes: () => [CMD.UI_PALETTES, []],
  /* (Skiff #27) none: the state; 0 show, 1 store (a look, 11 RGB565); 2 remove, 3 drop what is shown */
  colors: (o, look, c) => [CMD.COLORS, o === undefined ? [] : o > 1 ? [o] : [o, look, ...pack7(c.flatMap((x) => [x & 255, x >> 8]))]],
  favGet: (engine, start, count) => [CMD.FAV_GET, [engine, ...v14enc(start), count]],
  favSet: (engine, preset, on) => [CMD.FAV_SET, [engine, ...v14enc(preset), on ? 1 : 0]],
  info: () => [CMD.INFO, []],
  get: (scope, id) => [CMD.GET, widOut(scope, id)],
  set: (scope, id, v) => [CMD.SET, [...widOut(scope, id), ...v14enc(v)]],
  dump: () => [CMD.DUMP, []],
  desc: (scope, id) => [CMD.DESC, widOut(scope, id)],
  stepGet: (i) => [CMD.STEP_GET, [i]],
  stepSet: (i, st) => {
    const n = Math.max(0, Math.min(4, st.n | 0));
    const notes = [0, 1, 2, 3].map((k) => (st.notes[k] | 0) & 0x7F);
    return [CMD.STEP_SET, [i, n, ...notes, Math.max(0, Math.min(2, st.time | 0)), st.flags & 3, (st.vel | 0) & 0x7F,
      ...(st.hit == null && st.chance == null ? [] : hitsEnc(st.hit | 0, st.acc | 0)),
      ...(st.chance == null ? [] : [Math.max(0, Math.min(100, st.chance | 0))]),
      ...(st.chance == null || st.ratchet == null ? [] : [Math.max(1, Math.min(4, st.ratchet | 0))]),   /* (only after the chance) */
      ...(st.chance == null || st.ratchet == null || st.cond == null ? [] :                           /* (Skiff W1) FLAM, COND, */
        [st.flam ? 1 : 0, Math.max(0, Math.min(TC_NAMES.length - 1, st.cond | 0)), Math.max(0, Math.min(63, (st.nudge | 0) + 32))]),   /* NUDGE, */
      ...(st.chance == null || st.ratchet == null || st.cond == null || st.ties == null ? [] : [st.ties & 15])]];   /* ((2.0) the ties) */
  },
  preset: (e, p) => [CMD.PRESET, [e & 0x7F, p & 0x7F]],
  project: (op, slot) => { if (![0, 1, 2].includes(op)) throw new Error("bad PROJECT op"); return [CMD.PROJECT, [op, slot & 3]]; },   /* 0 load, 1 save, 2 query */
  song: (op = 0, rows = []) => {
    if (![0, 1, 2, 3].includes(op) || rows.length > 16 || rows.some((r) => !Number.isInteger(r.slot) || r.slot < 0 || r.slot > 3 || !Number.isInteger(r.repeat) || r.repeat < 1 || r.repeat > 16)) throw new Error("bad SONG rows");
    return [CMD.SONG, op === 1 ? [op, rows.length, ...rows.flatMap((r) => [r.slot, r.repeat])] : [op]];
  },
  motion: (track, op = 0, arg = {}, ntrk = 1) => {   /* ntrk: INFO's (the device's tracks) */
    if (!Number.isInteger(track) || track < 0 || track >= ntrk || ![0, 1, 2, 3, 4, 5, 6, 7].includes(op)) throw new Error("Invalid motion request");
    return [CMD.MOTION, [track, ...(op === 0 ? [] : op === 1 ? [op, arg.on ? 1 : 0] : op === 2 || op === 7 ? [op] :
      op === 6 ? [op, arg.step === 127 ? 127 : arg.step & 63] :   /* (1.1: 5 a lock, 6 a step's locks, 7 the query with the kinds) */
      [op, (arg.step & 63) | (arg.param >> 7 & 1) << 6, arg.param & 127, ...(op === 3 || op === 5 ? v14enc(arg.value) : [])])]];
  },
  names: (e) => [CMD.NAMES, [e & 0x7F]],
  smpBegin: (s) => [CMD.SMP_BEGIN, [s & 0x7F]],
  smpWrite: (s, off, bytes) => [CMD.SMP_WRITE, [s & 0x7F, off & 0x7F, (off >> 7) & 0x7F, (off >> 14) & 0x7F, ...pack7(bytes)]],
  smpEnd: (s, hdr) => [CMD.SMP_END, [s & 0x7F, ...pack7(hdr)]],
  smpErase: (s) => [CMD.SMP_ERASE, [s & 0x7F]],
  smpInfo: () => [CMD.SMP_INFO, []],
  /* (#21) the slot's sounds' mix; mix: [[LEVEL, REV, DLY] (0..127)] per sound sets it (the sounds past it: as uploaded) */
  smpMix: (s, mix) => [CMD.SMP_MIX, mix ? [s & 0x7F, ...[0, 1, 2].flatMap((w) => Array.from({ length: 16 },
    (_, i) => (i < mix.length ? mix[i][w] : [127, 0, 0][w]) & 0x7F))] : [s & 0x7F]],
  upList: (start, count) => [CMD.UP_LIST, [start & 0x7F, Math.max(1, Math.min(UP.LIST_MAX, count | 0))]],
  upGet: (s) => [CMD.UP_GET, [s & 0x7F]],
  /* patch: {engine, name, p: P_COUNT values, pattern: 16 x [note, flags] or grid: 16 x [hit, acc] (v5: kind 1)} */
  upPut: (s, pt) => [CMD.UP_PUT, [s & 0x7F, pt.engine & 0x7F, ...strEnc(upName(pt.name)), ...pt.p.flatMap((v) => v14enc(v ?? 0)),
    ...(pt.grid
      ? [...Array.from({ length: UP.PAT }, (_, i) => hitsEnc(...(pt.grid[i] || [0, 0])).slice(0, 2)).flat(), 1,
         ...Array.from({ length: UP.PAT }, (_, i) => hitsEnc(...(pt.grid[i] || [0, 0]))[2])]
      : Array.from({ length: UP.PAT }, (_, i) => { const x = (pt.pattern || [])[i] || [0, 0]; return [x[0] & 0x7F, x[1] & 7]; }).flat())]],
  upStore: (s, name) => [CMD.UP_STORE, [s & 0x7F, ...strEnc(name ? upName(name) : "")]],   /* "": the device names it ("ANALOG 07") */
  upLoad: (s) => [CMD.UP_LOAD, [s & 0x7F]],
  upErase: (s) => [CMD.UP_ERASE, [s & 0x7F]],
  /* on: 1 = pushes; 3 = also TRACK_CHANGED (v4 firmware answers 3, older firmware 1) */
  watch: (on) => [CMD.WATCH, [on === 3 ? 3 : on ? 1 : 0]],
  ping: () => [CMD.PING, []],
  /* v3: tracks 0..3 */
  track: (sel) => [CMD.TRACK, sel == null ? [] : [sel & 0x7F]],
  trackMix: (tr, level, mute) => [CMD.TRACK_MIX, level == null ? [tr & 0x7F] : [tr & 0x7F, ...v14enc(level), mute ? 1 : 0]],
  trackDump: (tr) => [CMD.TRACK_DUMP, [tr & 0x7F]],
  trackStep: (tr, i, st) => [CMD.TRACK_STEP, st ? [tr & 0x7F, ...req.stepSet(i, st)[1]] : [tr & 0x7F, i & 0x7F]],
  /* v4: get (v == null) or set parameter id (P_*) of track tr, clamped as SET */
  trackParam: (tr, id, v) => [CMD.TRACK_PARAM, [(tr & 63) | (id >> 7 & 1) << 6, id & 0x7F, ...(v == null ? [] : v14enc(v))]],
  /* FM6 patches (firmware with info.fm6) */
  fm6Get: (target, i) => [CMD.FM6_GET, [target & 0x7F, i & 0x7F]],
  fm6Put: (target, i, packed) => [CMD.FM6_PUT, [target & 0x7F, i & 0x7F, ...packed.map((x) => x & 0x7F)]],
  fm6List: () => [CMD.FM6_LIST, []],
  fm6Erase: (i) => [CMD.FM6_ERASE, [i & 0x7F]],
  menuDesc: (i) => [CMD.MENU_DESC, [i & 0x7F]],
  menuSet: (id, v) => [CMD.MENU_SET, [id & 0x7F, ...v14enc(v)]],
  kitGet: (lane) => [CMD.KIT_GET, [lane & 7]],
  kitPut: (k) => [CMD.KIT_PUT, [k.lane, k.wave, k.filt, +k.snap, k.pmod, +k.drive, ...k.a, ...k.b].map((x) => x & 0x7F)],
  transport: (op = 0) => [CMD.TRANSPORT, op ? [op] : []],            /* 1 PLAY, 2 STOP, 3 RESTART, 4 REC; none: the state */
  /* id: CLEAR it ((2.0, INFO 58 01) op 2: EMPTY it; 3, no id: CLEAR UNUSED); none: the pool */
  pool: (id, op = 1) => [CMD.POOL, op === 3 ? [3] : id == null ? [] : [op === 2 ? 2 : 1, id & 63]],
  /* 1 SET (v: pattern 1..64), 2 COPY, 3 PLAY, 4 CLEAR, 5 REPS (v: 1..16; (2.0) 0 CHAIN) entry e of track k, ((2.0) 7 NEW, 8
     COPY+; (#30, LIST2's, INFO 58 01 bit 1) 9 SOUND, v: its two bytes); 6 SONG (k: 0 off, 1 on, (2.0) 2 ONCE); none: the
     lists. two: (2.0, INFO 58 01) as LIST2 (82) */
  list: (op = 0, k = 0, e = 0, v = null, two = false) => [two ? CMD.LIST2 : CMD.LIST,
    !op ? [] : op === 6 ? [6, Math.max(0, Math.min(2, +k | 0))] : v == null ? [op, k, e] : [op, k, e, ...[v].flat().map((x) => x & 0x7F)]],
  perform: (op = 0, v = 0) => [CMD.PERFORM, !op ? [] : op === 4 ? [4] : [op, v]],   /* 1 STORE, 2 RECALL, 3 MUTE, 4 CANCEL, 5 LAUNCH */
  projName: (op = 0, slot = 0, name = "") => [CMD.PROJ_NAME, op ? [op, slot & 3, ...strEnc(cleanProjName(name))] : []],   /* 1 SAVE AS, 2 RENAME */
};
/* (Skiff W3) the device's MENU settings, each as MENU_DESC describes it (none asked of firmware without them) */
async function readDeviceMenu(rq, info) {
  const items = [];
  for (let i = 0; i < (info.menuCount | 0); i++) {
    const d = parse[CMD.MENU_DESC](await rq(req.menuDesc(i)));
    if (d.id === 127) break;
    items.push(d);
  }
  return items;
}

/* which reply belongs to which request (the device echoes these) */
function replyMatches(cmd, args, a) {
  switch (cmd) {
    case CMD.MOTION: return a[0] === args[0];
    case CMD.MENU_DESC: return a[0] === args[0];
    case CMD.MENU_SET: return a[1] === args[0];
    case CMD.KIT_GET: case CMD.KIT_PUT: return a[0] === args[0];
    case CMD.PROJ_NAME: case CMD.POOL: case CMD.LIST: case CMD.LIST2: case CMD.PERFORM: return a[0] === (args[0] || 0);
    case CMD.BACKUP_GET: return a[0] === args[0] && a.slice(2, 7).every((v, i) => v === args[i + 1]);
    case CMD.BACKUP_PUT: return a[0] === args[0] && a[1] === args[1];
    case CMD.UI_SET: return a[1] === args[0] && a[2] === args[1];
    case CMD.FAV_GET: case CMD.FAV_SET:
      return ![0, 3, 4].includes(a[0]) || (a[1] === args[0] && a[2] === args[1] && a[3] === args[2] && a[4] === args[3]);
    case CMD.GET: case CMD.SET: case CMD.DESC: return a[0] === args[0] && a[1] === args[1];
    case CMD.STEP_GET: case CMD.STEP_SET: case CMD.NAMES:
    case CMD.SMP_BEGIN: case CMD.SMP_END: case CMD.SMP_ERASE: case CMD.SMP_MIX: return a[0] === args[0];
    case CMD.SMP_WRITE: return a[0] === args[0] && a[1] === args[1] && a[2] === args[2] && a[3] === args[3];
    case CMD.SONG: return a[0] === args[0];
    case CMD.FM6_GET: case CMD.FM6_PUT: return a[0] === args[0] && a[1] === args[1];
    case CMD.FM6_ERASE: return a[0] === args[0];
    case CMD.PROJECT: return a[0] === args[0] && a[1] === args[1];
    case CMD.UP_LIST: case CMD.UP_GET: case CMD.UP_PUT: case CMD.UP_STORE: case CMD.UP_LOAD: case CMD.UP_ERASE:
    case CMD.TRACK_MIX: case CMD.TRACK_DUMP: return a[0] === args[0];
    case CMD.WATCH: return (a[0] & 1) === (args[0] & 1);   /* bit 1: v4 firmware only */
    case CMD.TRACK_STEP: case CMD.TRACK_PARAM: return a[0] === args[0] && a[1] === args[1];
    default: return true;
  }
}

/* strict request/response: one frame in flight, the rest queued. Push frames (CHANGED, RELOAD,
   STEP_CHANGED) can come at any time, also between a request and its reply: they go to onPush. */
/* (2.0.1, #50) the ports a unit may be on, as the installer finds them (fm1ota.js find): an input and an output of the
   same name, connected, the name one a unit can have (macOS can give its port a generic name: the installer found the
   unit, the editor looked for "Felucca" only). "Felucca" first; connect() takes the first pair that answers INFO */
const UNIT_PORT = /fm-1|smk|elite|mke-p37|starry|felucca|composite|sinco|usb-midi/i;
function portPairs(access) {
  const outs = [...access.outputs.values()], pairs = [];
  for (const i of access.inputs.values()) {
    if (i.state === "disconnected" || !UNIT_PORT.test(i.name || "")) continue;
    const o = outs.find((x) => x.name === i.name && x.state !== "disconnected");
    if (o) pairs.push([i, o]);
  }
  return pairs.sort((a, b) => /felucca/i.test(b[0].name) - /felucca/i.test(a[0].name));
}

class Link {
  constructor(send, opts = {}) {
    this.sendRaw = send;
    this.q = [];
    this.cur = null;
    this.closed = false;
    this.lastSent = 0;                              /* Date.now() of the last frame sent (WATCH keep-alive) */
    this.timeout = opts.timeout || 300;
    this.onUnknown = opts.onUnknown || (() => {});
    this.onTimeout = opts.onTimeout || (() => {});
    this.onPush = opts.onPush || (() => {});
    this.onGap = opts.onGap || (() => {});         /* (ms) nothing was sent for that long (WATCH may have ended) */
  }
  get idle() { return !this.cur && !this.q.length; }
  hasQueued(key) { return this.q.some((r) => r.key === key); }
  /* r = [cmd, args]; opt: {timeout, retries, key (coalesce queued requests: the latest args win), front,
     quiet (a timeout is expected: no onTimeout)} */
  request(r, opt = {}) {
    if (this.closed) return Promise.reject(new Error("closed"));
    const [cmd, args] = r;
    if (opt.key) {
      const old = this.q.find((x) => x.key === opt.key);
      if (old) { old.cmd = cmd; old.args = args; return old.promise; }
    }
    let res, rej;
    const promise = new Promise((a, b) => { res = a; rej = b; });
    const item = { cmd, args, key: opt.key, res, rej, promise, quiet: !!opt.quiet,
      timeout: opt.timeout || this.timeout, retries: opt.retries ?? 1 };
    if (opt.front) this.q.unshift(item); else this.q.push(item);
    this.pump();
    return promise;
  }
  pump() {
    if (this.cur || this.closed || !this.q.length) return;
    this.cur = this.q.shift();
    this.fire();
  }
  fire() {
    const c = this.cur;
    const now = Date.now();
    if (this.lastSent && now - this.lastSent > 2500) this.onGap(now - this.lastSent);
    this.lastSent = now;
    try { this.sendRaw(frame(c.cmd, c.args)); } catch (e) { this.finish(null, e); return; }
    c.timer = setTimeout(() => {
      if (this.cur !== c) return;
      if (c.retries-- > 0) { this.fire(); return; }
      if (!c.quiet) this.onTimeout(c.cmd);
      this.finish(null, new Error("timeout (cmd " + c.cmd + ")"));
    }, c.timeout);
  }
  finish(val, err) {
    const c = this.cur;
    if (!c) return;
    clearTimeout(c.timer);
    this.cur = null;
    if (err) c.rej(err); else c.res(val);
    this.pump();
  }
  /* raw incoming MIDI bytes */
  receive(data) {
    const f = unframe(data);
    if (!f) return;                                  /* not ours (notes, clock, other SysEx) */
    if (PUSH.has(f.cmd)) { this.onPush(f); return; }
    const c = this.cur;
    if (!c || f.cmd !== c.cmd || !replyMatches(c.cmd, c.args, f.a)) { this.onUnknown(f); return; }
    this.finish(f.a);
  }
  close() {
    this.closed = true;
    const all = (this.cur ? [this.cur] : []).concat(this.q);
    if (this.cur) clearTimeout(this.cur.timer);
    this.cur = null;
    this.q = [];
    for (const r of all) r.rej(new Error("closed"));
  }
}

/* ------------------------------------------------------------- formatting --- */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);   /* 60 = C4 */
/* a note token: a number or a note name (C4, F#3, Bb2) */
function parseNote(tok) {
  if (/^\d+$/.test(tok)) { const n = +tok; return n <= 127 ? n : null; }
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(tok);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  const n = base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  return n >= 0 && n <= 127 ? n : null;
}
/* "C4 E4 G4" -> [60, 64, 67]; null on a bad token or more than 4 notes. (2.0, #25) "(C4)": a note going on from the step
   before, its bit in the array's .ties */
function parseNotes(s) {
  const t = s.trim().split(/[\s,]+/).filter(Boolean);
  if (t.length > 4) return null;
  const out = t.map((x) => parseNote(x.replace(/^\((.+)\)$/, "$1")));
  out.ties = t.reduce((m, x, k) => m | (/^\(.+\)$/.test(x) ? 1 << k : 0), 0);
  return out.includes(null) ? null : out;
}
/* (2.0, #25) a step's ties (bit k: note k goes on), as the device keeps them: none on a step with hits; a NOTE whose
   notes all go on is a tie, as a TIE (the device's step_tie) */
const stepTies = (s) => (s.hit ? 0 : (s.ties | 0) & ((1 << s.n) - 1));
const stepTie = (s) => !!s && (s.time === 1 || (s.time === 0 && s.n > 0 && stepTies(s) === (1 << s.n) - 1));

/* close to the device's param_format (params.c), tables from tools/gen_tables.py */
function fmtValue(d, v) {
  const sign = (x) => (x > 0 ? "+" + x : String(x));
  switch (d.fmt) {
    case F.PCT: return [String(d.max === 100 ? v : Math.trunc((v * 100 + 63) / 127)), "%"];   /* 0..100 (SWG): the value */
    case F.BIPCT: return [sign(Math.trunc(v * 100 / (v > 0 ? 63 : 64))), "%"];   /* (Skiff 1.3: +100 at the top, as the device) */
    case F.TIME: {
      const ms10 = Math.round(10 * Math.pow(10000, (v & 127) / 127));
      if (ms10 < 100) return [(ms10 / 10).toFixed(1), "ms"];
      if (ms10 < 10000) return [String(Math.round(ms10 / 10)), "ms"];
      return [(ms10 / 10000).toFixed(2), "s"];
    }
    case F.LFOHZ: { const h = 0.05 * Math.pow(800, (v & 127) / 127); return [h < 10 ? h.toFixed(2) : h.toFixed(1), "Hz"]; }
    case F.CUTOFF: { const h = 30 * Math.pow(16000 / 30, (v & 127) / 127); return h < 1000 ? [String(Math.round(h)), "Hz"] : [(h / 1000).toFixed(1), "kHz"]; }
    case F.DB: return v <= 0 ? ["OFF", ""] : [((v - 112) / 2).toFixed(1), "dB"];
    case F.SEMI: return [sign(v), "st"];
    case F.ENUM: return [d.names[v - d.min] ?? String(v), d.unit || ""];
    case F.BPM: return [String(v), "BPM"];
    case F.NOTE: return [NOTE_NAMES[((v % 12) + 12) % 12], ""];
    case F.ONOFF: return [v ? "ON" : "OFF", ""];
    case F.STEPS: return [String(v), "STEP"];
    case F.ST16: { const t = Math.trunc(((v - 64) * 30 + (v < 64 ? -8 : 8)) / 16); return [(t > 0 ? "+" : "") + (t / 10).toFixed(1), "st"]; }
    default: return [String(v), d.unit || ""];
  }
}

/* ---------------------------------------------------------- user samples --- */
/* A port of tools/sampleio.py (read_any_wav, resample, to_int16, ima_encode, user_slot),
   byte for byte: web/test_web.mjs compares them. */
const SMP = { SLOT_SIZE: 0x14000, DATA_OFF: 512, RATE: 22050, HDR_LEN: 32 + 16 * 28, MAX_ZONES: 16,
  MIX0: () => [...new Array(16).fill(127), ...new Array(32).fill(0)] };   /* ((#21) every sound as uploaded) */
SMP.MAX_DATA = SMP.SLOT_SIZE - SMP.DATA_OFF;

/* groups of up to 7 bytes, each preceded by their top bits */
function pack7(b) {
  const out = [];
  for (let i = 0; i < b.length; i += 7) {
    const g = Array.from(b.slice(i, i + 7));
    out.push(g.reduce((m, x, j) => m | (((x >> 7) & 1) << j), 0));
    for (const x of g) out.push(x & 0x7F);
  }
  return out;
}
function unpack7(a) {
  const out = [];
  for (let i = 0; i < a.length; i += 8) {
    const top = a[i];
    for (let j = 0; j < 7 && i + 1 + j < a.length; j++) out.push(a[i + 1 + j] | (((top >> j) & 1) << 7));
  }
  return Uint8Array.from(out);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88,
  97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658,
  724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660,
  4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818,
  18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IMA_IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
/* IMA ADPCM, 4 bit, low nibble first, from predictor 0 / index 0 -> {data, pred, idx} (state at loopStart) */
function imaEncode(s, loopStart = 0) {
  let pred = 0, idx = 0, atLoop = [0, 0];
  const nib = new Uint8Array(s.length + (s.length & 1));
  for (let n = 0; n < s.length; n++) {
    if (n === loopStart) atLoop = [pred, idx];
    const step = IMA_STEP[idx];
    let diff = s[n] - pred, code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    let vd = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vd += step; }
    if (diff >= step >> 1) { code |= 2; diff -= step >> 1; vd += step >> 1; }
    if (diff >= step >> 2) { code |= 1; vd += step >> 2; }
    pred = Math.max(-32768, Math.min(32767, code & 8 ? pred - vd : pred + vd));
    idx = Math.max(0, Math.min(88, idx + IMA_IDX[code & 7]));
    nib[n] = code;
  }
  const out = new Uint8Array(nib.length >> 1);
  for (let k = 0; k < nib.length; k += 2) out[k >> 1] = nib[k] | (nib[k + 1] << 4);
  return { data: out, pred: atLoop[0], idx: atLoop[1] };
}

/* WAV: PCM 8/16/24/32 or float, any channel count, mixed to mono -> {sr, x} (gen_samples.read_any_wav) */
function parseWav(buf) {
  const d = new Uint8Array(buf), v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const id = (i) => String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]);
  if (d.length < 12 || id(0) !== "RIFF" || id(8) !== "WAVE") throw new Error("not a WAV file");
  let i = 12, fmt = null, data = null;
  while (i + 8 <= d.length) {
    const cid = id(i), n = v.getUint32(i + 4, true);
    if (cid === "fmt ") {
      let tag = v.getUint16(i + 8, true);
      const ch = v.getUint16(i + 10, true), sr = v.getUint32(i + 12, true), bits = v.getUint16(i + 22, true);
      if (tag === 0xFFFE) tag = v.getUint16(i + 32, true);
      fmt = { tag, ch, sr, bits };
    } else if (cid === "data") {
      data = [i + 8, Math.min(d.length, i + 8 + n)];
      break;
    }
    i += 8 + n + (n & 1);
  }
  if (!fmt || !data) throw new Error("WAV without fmt/data");
  const { tag, ch, sr, bits } = fmt, bps = bits >> 3, frame = bps * ch;
  if (!(tag === 1 || tag === 3) || !bps || !ch) throw new Error("unsupported WAV format");
  const nfr = Math.floor((data[1] - data[0]) / frame), x = new Float64Array(nfr);
  for (let f = 0; f < nfr; f++) {
    let acc = 0;
    for (let c = 0; c < ch; c++) {
      const o = data[0] + f * frame + c * bps;
      let s;
      if (tag === 3) s = bps === 4 ? v.getFloat32(o, true) : v.getFloat64(o, true);
      else if (bps === 2) s = v.getInt16(o, true) / 32768;
      else if (bps === 3) s = (((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) << 8) >> 8) / 8388608;
      else if (bps === 4) s = v.getInt32(o, true) / 2147483648;
      else s = (d[o] - 128) / 128;
      acc += s;
    }
    x[f] = acc / ch;
  }
  return { sr, x };
}

/* gen_samples.resample: moving average over the ratio, then linear interpolation */
function resample(x, sr, to) {
  if (sr === to) return Array.from(x);
  if (sr > to) {
    const k = Math.max(1, pyRound(sr / to));
    if (k > 1) {
      const y = new Array(x.length);
      for (let i = 0; i < x.length; i++) { let s = 0; for (let j = i; j < Math.min(x.length, i + k); j++) s += x[j]; y[i] = s / k; }
      x = y;
    }
  }
  const step = sr / to, out = [];
  let p = 0;
  while (p < x.length - 1) { const i = Math.floor(p), f = p - i; out.push(x[i] * (1 - f) + x[i + 1] * f); p += step; }
  return out;
}
function pyRound(v) { const f = Math.floor(v), r = v - f; return r > 0.5 ? f + 1 : r < 0.5 ? f : (f % 2 ? f + 1 : f); }

/* mono float -> int16, peak (x's own, or pk: one gain for several) normalised to 30000 */
function normalize(x, pk = 0) {
  if (!pk) { pk = 1e-9; for (const v of x) pk = Math.max(pk, Math.abs(v)); }
  return Int16Array.from(x, (v) => Math.max(-32768, Math.min(32767, Math.trunc(v / pk * 30000))));
}

/* a trimmed sample: raw (mono float at SMP.RATE) from a to b, a fade of FADE samples at both cut ends
 * (no click where the sound was cut; none at the file's own start and end), normalised */
const FADE = 44;                                     /* 2 ms at 22050 Hz */
function cutFade(raw, a, b) {
  a = Math.max(0, Math.min(raw.length - 1, a | 0));
  b = Math.max(a + 1, Math.min(raw.length, b | 0));
  const x = Float64Array.from(raw.subarray ? raw.subarray(a, b) : raw.slice(a, b));
  const n = Math.min(FADE, x.length >> 1);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    if (a > 0) x[i] *= g;
    if (b < raw.length) x[x.length - 1 - i] *= g;
  }
  return x;
}
const takeSample = (raw, a, b) => normalize(cutFade(raw, a, b));

/* (#35) a DRUM KIT for a user slot: rows by lane (LANES), each null or {raw, a, b, lvl 0..1} -> buildSlot's zones,
 * each on its lane's key only (DRUM plays the zone holding its lane's note); one gain for the whole kit (its
 * loudest at 30000), so the files keep their levels to each other, times lvl */
function kitZones(rows) {
  const xs = rows.map((r) => r && cutFade(r.raw, r.a, r.b).map((v) => v * r.lvl));
  let pk = 1e-9;
  for (const x of xs) if (x) for (const v of x) pk = Math.max(pk, Math.abs(v));
  return xs.flatMap((x, i) => x ? [{ s: normalize(x, pk), root: LANE_NOTE[i], lo: LANE_NOTE[i], hi: LANE_NOTE[i] }] : []);
}

/* a trimming view [v0, v1) of n samples: zoomed by factor (< 1 in) around the fraction at of the
 * view, then moved by pan views; at least 256 samples (~12 ms), inside [0, n) */
function zoomView(n, v0, v1, at, factor, pan) {
  const min = Math.min(n, 256);
  let span = Math.round(Math.max(min, Math.min(n, (v1 - v0) * factor)));
  let c = v0 + at * (v1 - v0) + pan * span;         /* the sample under the pointer stays under it */
  let a = Math.round(c - at * span);
  a = Math.max(0, Math.min(n - span, a));
  return [a, a + span];
}

/* where the sound is: the first and last sample above rel x the peak, with a 5 ms pre-roll and a
 * 20 ms tail; [0, length] for silence */
function autoTrim(raw, rel = 0.02) {
  let pk = 0;
  for (const v of raw) pk = Math.max(pk, Math.abs(v));
  if (!pk) return [0, raw.length];
  const th = pk * rel;
  let a = 0, b = raw.length - 1;
  while (a < raw.length && Math.abs(raw[a]) < th) a++;
  while (b > a && Math.abs(raw[b]) < th) b--;
  return [Math.max(0, a - Math.round(SMP.RATE * 0.005)), Math.min(raw.length, b + 1 + Math.round(SMP.RATE * 0.02))];
}

/* root from a file name like "piano_C4" or "F#3" (C4 = 60), else 60 (sampleio.note_from_name) */
function rootFromName(name) {
  const m = /(?<![A-Za-z])([A-G])([#b]?)(-?\d)(?!\d)/.exec(name);
  if (!m) return 60;
  const n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  return Math.max(0, Math.min(127, n));
}

/* zones: [{s: Int16Array (22050 Hz), root, lo?, hi?}] -> {hdr (480 B), data, zones} (sampleio.user_slot) */
function buildSlot(name, zonesIn) {
  const zones = [], parts = [];
  let len = 0;
  for (const z of zonesIn) {
    const e = imaEncode(z.s, 0);
    zones.push({ off: len, n: z.s.length, ls: 0, le: z.s.length - 1, root: z.root, lo: z.lo ?? null, hi: z.hi ?? null, pred: e.pred, idx: e.idx,
      mix: z.mix });                                 /* ((#21) its LEVEL, REV, DLY: in the slot's order after the sort) */
    parts.push(e.data);
    len += e.data.length;
  }
  const data = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { data.set(p, o); o += p.length; }
  if (len > SMP.MAX_DATA) throw new Error(`too long: ${len} B (max ${SMP.MAX_DATA} B)`);
  if (!zones.length || zones.length > SMP.MAX_ZONES) throw new Error("1..16 files per slot");
  zones.sort((a, b) => a.root - b.root);
  zones.forEach((z, j) => {
    if (z.lo == null) {
      z.lo = j === 0 ? 0 : Math.floor((zones[j - 1].root + z.root) / 2) + 1;
      z.hi = j === zones.length - 1 ? 127 : Math.floor((z.root + zones[j + 1].root) / 2);
    }
  });
  const hdr = new Uint8Array(SMP.HDR_LEN), v = new DataView(hdr.buffer);
  v.setUint32(0, 0x504D5346, true);
  v.setUint16(4, 1, true);
  hdr[6] = zones.length;
  const nm = String(name).toUpperCase().replace(/[^\x20-\x7E]/g, "").slice(0, 8);
  for (let i = 0; i < nm.length; i++) hdr[8 + i] = nm.charCodeAt(i);
  v.setUint32(16, len, true);
  v.setUint32(20, crc32(data), true);
  const rate = pyRound(SMP.RATE / 44100 * 65536);
  zones.forEach((z, j) => {
    const b = 32 + j * 28;
    [z.off, z.n, z.ls, z.le, rate].forEach((x, k) => v.setUint32(b + k * 4, x >>> 0, true));
    v.setInt16(b + 20, z.root * 16, true);
    v.setInt16(b + 22, z.pred, true);
    hdr[b + 24] = z.idx; hdr[b + 25] = z.lo; hdr[b + 26] = z.hi; hdr[b + 27] = 0;
  });
  return { hdr, data, zones };
}

/* -------------------------------------------------------------- librarian --- */
/* A patch (library entry, user preset):
     {name, engine (index), engineName, p: [P_COUNT values by parameter id, null = unknown],
      pattern: 16 x [note 0..127 (0 rest), flags 1 accent | 2 slide | 4 tie] or null,
      grid: 16 x [lane hits 0..255, their accents] or null (a DRUM sound's 16 steps; then no pattern),
      tags: [], created, modified}

   Library / bank / single-patch file (JSON):
     {
       "format": "felucca-library", "version": 1,
       "kind": "library" | "bank" | "patch",
       "firmware": "FELUCCA 0.5 ...",          device version string when exported ("" if unknown)
       "pCount": 57, "pE0": 49,                 P_COUNT and the first engine parameter id
       "paramLabels": ["LEVEL", "ATTACK", ...], one key per parameter id: the DESC label, "#2", "#3" appended to
                                                a repeated label (PITCH, PITCH#2), and "E0".."E7" for the engine
                                                parameters (their labels depend on the engine)
       "engines": ["ANALOG", ...],              engine names by index
       "exported": "2026-10-03T12:00:00.000Z",
       "patches": [{ "name", "engine", "engineName", "params": [pCount numbers or null],
                     "pattern": [[note, flags] x 16] or null, "grid": [[hits, accents] x 16] (when there is one),
                     "tags": [...], "created", "modified",
                     "slot": n (bank files only, 0-based) }]
     }
   Reading maps every parameter by its key, so a firmware with other ids (or more parameters) still gets
   the right values; parameters the file does not have are null (left at the engine default). Engines are
   matched by name. The old single-sound file ("felucca-patch" version 1, "Save to file") is read too. */
const LIB = { FORMAT: "felucca-library", VERSION: 1 };

/* parameter keys by id from the instrument DESCs */
function paramKeys(pdesc, pe0, pcount) {
  const seen = {}, out = [];
  for (let i = 0; i < pcount; i++) {
    if (i >= pe0) { out.push("E" + (i - pe0)); continue; }
    const l = (pdesc[i] && pdesc[i].label) || "P" + i;
    seen[l] = (seen[l] || 0) + 1;
    out.push(seen[l] > 1 ? `${l}#${seen[l]}` : l);
  }
  return out;
}
const sameKeys = (a, b) => !!a && !!b && a.length === b.length && a.every((k, i) => k === b[i]);
/* (Skiff U4, the words) the track parameters' labels before U4 (LVL ATK .., by id): a library file keyed by them still
   finds its values, its keys taken to today's by id (a file of today has LEVEL: as it is) */
const LEGACY_TP = ["LVL", "ATK", "DEC", "SUS", "REL", "FLT", "PIT", "SHP", "FX", "RATE", "WAVE", "PHS", "FADE", "PIT", "FLT",
  "SHP", "AMP", "MODE", "RATE", "OCT", "GATE", "SWG", "PROB", "HOLD", "ORD", "ROOT", "SCL", "QNT", "TRN", "LEN", "DIV", "SWG",
  "GATE", "DST", "CHO", "DLY", "REV", "VCE", "GLD", "PAN", "MUTE", "GLMOD", "PRIO", "ALLOC", "DTUNE", "SLCR", "PAT", "RATE",
  "DEPTH", "SRC1", "DST1", "AMT1", "SRC2", "DST2", "AMT2", "SRC3", "DST3", "AMT3", "SRC4", "DST4", "AMT4",
  "ATK", "DEC", "SUS", "REL", "LVL", "ATK", "DEC", "SUS", "REL", "LVL", "ATK", "DEC", "SUS", "REL", "LVL", "ATK", "DEC", "SUS",
  "REL", "LVL", "CHRD", "VOIC", "KICK", "SNARE", "CLAP", "HATCL", "HATOP", "TOM", "RIM", "BELL", "DIR", "BY", "DEPTH", "REL"];
function legacyKeys(fileKeys, keys) {
  if (!fileKeys || !keys || !fileKeys.includes("LVL") || fileKeys.includes("LEVEL")) return fileKeys;
  const old = paramKeys(LEGACY_TP.map((label) => ({ label })), LEGACY_TP.length, LEGACY_TP.length);
  const to = new Map(old.map((k, i) => [k, keys[i]]));
  return fileKeys.map((k) => (to.has(k) && to.get(k) ? to.get(k) : k));
}
/* values by fromKeys -> values by toKeys (null where the source has no such key) */
function remapParams(p, fromKeys, toKeys, pe0) {
  if (!fromKeys && toKeys && pe0 && p.length !== toKeys.length) return tailParams(p, toKeys.length, pe0);
  if (!fromKeys || !toKeys || sameKeys(fromKeys, toKeys)) return p.slice();
  const at = new Map(fromKeys.map((k, i) => [k, i]));
  return toKeys.map((k) => (at.has(k) ? p[at.get(k)] ?? null : null));
}

/* values without keys from another firmware: ids below its P_E0 kept their places, its last 8 are E0..E7
   (common ids are only ever appended before P_E0); the rest stay null */
function tailParams(p, n, pe0) {
  const out = Array(n).fill(null), common = Math.max(0, p.length - 8);
  for (let i = 0; i < Math.min(common, pe0); i++) out[i] = p[i] ?? null;
  for (let k = 0; k < 8 && common + k < p.length; k++) out[pe0 + k] = p[common + k] ?? null;
  return out;
}

/* one pattern step as the firmware keeps it (up_pat_norm): a tie has no note, a rest no flags; flags 1 accent, 2 slide,
   4 tie, 8 | 16 the ratchet - 1 (core.h SF_RATCH) */
const patNorm = (n, f) => (f & 4 ? [0, 4] : [n & 0x7F, n ? f & 27 : 0]);
/* sequencer steps (STEP_GET objects) -> 16-step pattern, as the firmware's UP_STORE does (up_pat_from):
   the first note of a NOTE step ((2.0, #25) the first starting there), flag 4 for a TIE step (or one whose notes all
   go on) */
function patternFromSteps(steps) {
  return Array.from({ length: UP.PAT }, (_, i) => {
    const s = steps[i];
    if (!s) return [0, 0];
    const k = s.time === 0 ? s.notes.findIndex((_, x) => x < s.n && !(stepTies(s) >> x & 1)) : -1;
    return patNorm(k >= 0 ? s.notes[k] : 0, stepTie(s) ? 4 : (s.flags & 3) | ((s.ratchet || 1) - 1) << 3);
  });
}
/* pattern -> 16 STEP_SET objects, as the firmware loads one (load_pat16; velocity 96); the ratchet is sent only with a
   chance (req.stepSet) */
function stepsFromPattern(pat) {
  return Array.from({ length: UP.PAT }, (_, i) => {
    const [n, f] = (pat && pat[i]) || [0, 0];
    return { n: n ? 1 : 0, notes: [n & 0x7F, 0, 0, 0], time: f & 4 ? 1 : n ? 0 : 2, flags: n ? f & 3 : 0, vel: n ? 96 : 0,
      ratchet: n ? (f >> 3 & 3) + 1 : 1 };
  });
}
const patternUsed = (pat) => !!pat && pat.some((x) => x && x[0]);
/* a DRUM track's first 16 steps -> a grid, as the firmware's UP_STORE stores one (its notes on their lanes) */
const gridFromSteps = (steps) => Array.from({ length: UP.PAT }, (_, i) => (steps[i] ? [stepLanes(steps[i]), stepAccents(steps[i])] : [0, 0]));

function cleanPatch(pt) {
  const now = new Date().toISOString();
  const pat = Array.isArray(pt.pattern) && pt.pattern.length
    ? Array.from({ length: UP.PAT }, (_, i) => { const x = pt.pattern[i]; return Array.isArray(x) ? patNorm(x[0] | 0, x[1] | 0) : [0, 0]; })
    : null;
  const grid = Array.isArray(pt.grid) && pt.grid.length
    ? Array.from({ length: UP.PAT }, (_, i) => { const x = pt.grid[i]; const h = Array.isArray(x) ? x[0] & 255 : 0; return [h, Array.isArray(x) ? x[1] & h : 0]; })
    : null;
  const o = {
    name: String(pt.name ?? "PATCH").slice(0, 32) || "PATCH",
    engine: pt.engine | 0, engineName: String(pt.engineName ?? ""),
    p: Array.from(pt.p || pt.params || [], (v) => (Number.isFinite(v) ? Math.round(v) : null)),
    pattern: patternUsed(grid) ? null : patternUsed(pat) ? pat : null,
    grid: patternUsed(grid) ? grid : null,
    tags: Array.isArray(pt.tags) ? [...new Set(pt.tags.map((x) => String(x).trim()).filter(Boolean))] : [],
    created: pt.created || now, modified: pt.modified || pt.created || now,
  };
  if (Number.isInteger(pt.slot)) o.slot = pt.slot;
  if (Array.isArray(pt.fm6) && pt.fm6.length === FM6.PACKED) o.fm6 = pt.fm6.map((x) => (x | 0) & 127);   /* (a converted */
  if (Array.isArray(pt.fm4)) o.fm4 = pt.fm4.map((v) => (Number.isFinite(v) ? Math.round(v) : null));    /* DIGITAL sound) */
  return o;
}

/* ctx: {keys, engines, firmware, pe0} of the library (the device's when connected) */
function libraryFile(kind, patches, ctx) {
  return {
    format: LIB.FORMAT, version: LIB.VERSION, kind, firmware: ctx.firmware || "",
    pCount: ctx.keys ? ctx.keys.length : 0, pE0: ctx.pe0 ?? null, paramLabels: ctx.keys || [], engines: ctx.engines || [],
    exported: new Date().toISOString(),
    patches: patches.map((x) => {
      const c = cleanPatch(x);
      const o = { name: c.name, engine: c.engine, engineName: c.engineName || (ctx.engines || [])[c.engine] || "",
        params: c.p, pattern: c.pattern, tags: c.tags, created: c.created, modified: c.modified };
      if (c.grid) o.grid = c.grid;
      if (c.fm6) { o.fm6 = c.fm6; if (c.fm4) o.fm4 = c.fm4; }   /* an FM6 sound's own patch (a DIGITAL sound converted: and
                                                         the DIGITAL values) */
      if (Number.isInteger(x.slot)) o.slot = x.slot;
      return o;
    }),
  };
}
/* -> {patches, skipped, keys (the file's, for a library that has none yet)}; throws on a file it cannot read.
   A DIGITAL patch (the engine retired in 1.0) where ctx has no DIGITAL imports as FM6 (fromDigital); a SAMPLE PERC
   one (the set retired after 1.0.2) as DRUM's kit (fromPerc) */
function readLibraryFile(obj, ctx) {
  if (!obj || typeof obj !== "object") throw new Error("not JSON");
  const noFm4 = !(ctx.engines || []).includes("DIGITAL");
  const perc = (pt, pe0) => (pt && fromPerc(pt, ctx.engines, pe0)) || pt;
  const fm4 = (pt, nm, pe0) => (nm === "DIGITAL" && noFm4 ? fromDigital(pt, ctx.engines, pe0) : perc(pt, pe0));
  const engIndex = (name, idx, fileEngines) => {
    const nm = name || (fileEngines || [])[idx];
    if (ctx.engines && ctx.engines.length) {
      if (nm) return ctx.engines.indexOf(nm);
      return idx < ctx.engines.length ? idx : -1;
    }
    return idx;
  };
  if (obj.format === "felucca-patch") {               /* "Save to file": the whole current sound */
    if (!Array.isArray(obj.p) || !Number.isInteger(obj.engine)) throw new Error("felucca-patch without engine / p");
    const digital = obj.engineName === "DIGITAL" && noFm4;
    const e = digital ? 1 : engIndex(obj.engineName, obj.engine);
    if (e < 0) return { patches: [], skipped: 1, keys: null };
    const p = ctx.keys && ctx.pe0 && obj.p.length !== ctx.keys.length ? tailParams(obj.p, ctx.keys.length, ctx.pe0)
      : obj.p.slice(0, ctx.keys ? ctx.keys.length : obj.p.length);
    const pt = fm4({ name: obj.presetName || obj.engineName || "PATCH", engine: e, engineName: obj.engineName, p,
      pattern: Array.isArray(obj.steps) ? patternFromSteps(obj.steps) : null, tags: ["file"] }, obj.engineName,
      ctx.keys && ctx.pe0 ? ctx.pe0 : p.length - 8);
    return pt ? { patches: [cleanPatch(pt)], skipped: 0, keys: null } : { patches: [], skipped: 1, keys: null };
  }
  if (obj.format !== LIB.FORMAT) throw new Error("unknown format");
  if (!(obj.version >= 1)) throw new Error("version");
  if (!Array.isArray(obj.patches)) throw new Error("no patches");
  const fileKeys = legacyKeys(Array.isArray(obj.paramLabels) && obj.paramLabels.length ? obj.paramLabels.map(String) : null,
    ctx.keys);   /* ((Skiff U4) a file of before U4's words: its keys by id) */
  const out = [];
  let skipped = 0;
  for (const x of obj.patches) {
    if (!x || !Array.isArray(x.params)) { skipped++; continue; }
    const nm = x.engineName || (obj.engines || [])[x.engine | 0];
    const digital = nm === "DIGITAL" && noFm4;
    const e = digital ? 1 : engIndex(x.engineName, x.engine | 0, obj.engines);
    if (e < 0) { skipped++; continue; }
    const p = remapParams(x.params, fileKeys, ctx.keys, ctx.pe0);
    const pe0 = ctx.keys && ctx.pe0 ? ctx.pe0 : obj.pE0 ?? p.length - 8;
    const pt = digital ? fromDigital({ ...x, engine: e, p }, ctx.engines, pe0)
      : perc(cleanPatch({ ...x, engine: e, engineName: (ctx.engines || [])[e] || x.engineName || (obj.engines || [])[x.engine], p }), pe0);
    if (!pt) { skipped++; continue; }
    out.push(cleanPatch(pt));
  }
  return { patches: out, skipped, keys: fileKeys };
}

/* device side; rq(r, opt) -> reply args (Link.request), info from INFO */
const FLASH_OPT = { timeout: 2500, retries: 0 };
const presetPatches = (info) => !!(info && info.fm6 && info.fm6.caps & 2);   /* user presets carry FM6 patches (1.0.3) */
const bank = {
  async list(rq) {
    const first = parse[CMD.UP_LIST](await rq(req.upList(0, UP.LIST_MAX)));
    const slots = first.slots.slice();
    while (slots.length < first.total) {
      const r = parse[CMD.UP_LIST](await rq(req.upList(slots.length, Math.min(UP.LIST_MAX, first.total - slots.length))));
      if (!r.count) break;
      slots.push(...r.slots);
    }
    return { total: first.total, slots };
  },
  /* an FM6 sound's own patch comes with it (fm6: packed) where the firmware keeps one (INFO fm6.caps bit 1) */
  async get(rq, info, slot) {
    const u = parse[CMD.UP_GET](await rq(req.upGet(slot)), info);
    if (u.used && presetPatches(info) && info.engines[u.engine] === "FM6") {
      const g = parse[CMD.FM6_GET](await rq(req.fm6Get(FM6.TARGET.USER, slot)));
      if (!g.rc) u.fm6 = g.packed;
    }
    return u;
  },
  /* -> rc (0 ok); with info, an FM6 sound's patch (pt.fm6) goes with it */
  async put(rq, slot, pt, info) {
    const rc = parse[CMD.UP_PUT](await rq(req.upPut(slot, pt), FLASH_OPT)).rc;
    if (rc || !pt.fm6 || !presetPatches(info) || info.engines[pt.engine] !== "FM6") return rc;
    return parse[CMD.FM6_PUT](await rq(req.fm6Put(FM6.TARGET.USER, slot, pt.fm6), FLASH_OPT)).rc;
  },
  async store(rq, slot, name) { return parse[CMD.UP_STORE](await rq(req.upStore(slot, name), FLASH_OPT)).rc; },
  async load(rq, slot) { return parse[CMD.UP_LOAD](await rq(req.upLoad(slot), { timeout: 1000 })).rc; },
  async erase(rq, slot) { return parse[CMD.UP_ERASE](await rq(req.upErase(slot), FLASH_OPT)).rc; },
};

/* the current sound: DUMP + the first 16 steps */
async function capturePatch(rq, info, name) {
  const dump = parse[CMD.DUMP](await rq(req.dump()), info);
  const steps = [];
  for (let i = 0; i < UP.PAT && i < info.nstep; i++) steps.push(parse[CMD.STEP_GET](await rq(req.stepGet(i))));
  const drum = ["DRUM", "DRUM-X"].includes(info.engines[dump.engine]);   /* (a kit's track that strikes a lane: its grid) */
  let fm6 = null;                                      /* an FM6 track: its own patch (the selected track's) */
  if (info.fm6 && info.engines[dump.engine] === "FM6") {
    const sel = info.ntrk ? parse[CMD.TRACK](await rq(req.track())).sel : 0;
    const g = parse[CMD.FM6_GET](await rq(req.fm6Get(FM6.TARGET.TRACK, sel)));
    if (!g.rc) fm6 = g.packed;
  }
  return { patch: cleanPatch({ name, engine: dump.engine, engineName: info.engines[dump.engine], p: dump.p, pattern: patternFromSteps(steps),
    grid: drum ? gridFromSteps(steps) : null, fm6 }), dump, steps };
}

/* the track's own parameters, which no sound load changes (ui.c param_kept): LEVEL, the ARP and ARP 2 pages,
   SCL, LEN DIV SWING GATE (17..32), PAN, MUTE, the SLICER (45..48); with P_E0 83 the chord keys CHRD VOIC (81, 82:
   E0 E1 of the 89-parameter firmware) */
const TRACK_OWN = new Set([0, 39, 40, ...Array.from({ length: 16 }, (_, i) => 17 + i), 45, 46, 47, 48]);
const P_CHORD = [81, 82];                          /* core.h P_CHRD, P_VOIC (since P_COUNT 91, P_E0 83) */
const P_LANES = [83, 84, 85, 86, 87, 88, 89, 90];   /* core.h P_LN0..P_LN7: the DRUM lane levels (since P_COUNT 99, P_E0 91) */
const P_DIR = 91;                                  /* (Skiff) core.h P_DIR: the play direction, the track's (P_COUNT 100, P_E0 92) */
const P_DUCK = [92, 93, 94];                       /* (Skiff) core.h P_DKSRC P_DKAMT P_DKREL: the ducking, the track's (P_COUNT 103, P_E0 95) */
/* (Skiff phase 9, P_COUNT 125, P_E0 117) core.h P_DTYPE P_DTONE (FX > DRIVE), P_EG2_ATK .. REL (ENV 2), P_LTUNE0..7 and
   P_LDECAY0..7 (the DRUM lanes' TUNE and DECAY): sound parameters, as the engine's */
const P_DRIVE = [95, 96], P_ENV2 = [97, 98, 99, 100];
const P_LTUNE = Array.from({ length: 8 }, (_, i) => 101 + i), P_LDECAY = Array.from({ length: 8 }, (_, i) => 109 + i);
/* (Skiff 1.3, P_COUNT 135, P_E0 127: wide ids) core.h P_LSYNC P_LTRIG P_LPOL (LFO 2), P_SPRD (SPREAD), P_ITYPE P_IA P_IB P_IC
   P_IMIX (FX > INSERT), P_ESYNC (ENV SYNC): sound parameters, as the engine's */
const P_LFO2 = [117, 118, 119], P_SPRD = 120, P_INSERT = [121, 122, 123, 124], P_IMIX = 125, P_ESYNC = 126;
const P_LPAN = Array.from({ length: 8 }, (_, i) => 127 + i);   /* (2.0, #36, P_COUNT 143, P_E0 135) core.h P_LPAN0..7: the
                                                   DRUM lanes' PAN, sound parameters as the lane levels */
const P_FOLLOW = [135, 136, 137];   /* (2.1, P_COUNT 146, P_E0 138) core.h P_FOLLOW P_FMODE P_FNOTE: the chord follow, the
                                     track's */
const trackOwn = (i, pe0) => TRACK_OWN.has(i) || (pe0 >= 83 && P_CHORD.includes(i)) || (pe0 >= 92 && i === P_DIR) ||
  (pe0 >= 95 && P_DUCK.includes(i)) || (pe0 >= 138 && P_FOLLOW.includes(i));
/* play a patch without writing flash, as UP_LOAD would load it: the sound only. SET the engine (G_ENGSEL:
   engine defaults and its first preset), then every instrument parameter that differs, except the track's
   own (TRACK_OWN). The steps are never touched. The device keeps a copy of the sound from before (SAVE held
   there = undo) and treats the SETs right after G_ENGSEL as part of this load (EDITOR_PROTOCOL.md "undo").
   opt: {gEng: G_ENGSEL id, progress(i, n)} */
/* (Skiff phase 6, W4) whether track `tr` may not play engine `e` (INFO 54 01: the light tracks, the engines they may not) */
function lightRefuses(info, tr, e) {
  const l = info && info.light;
  return !!l && ((l.tracks >> (tr | 0)) & 1) === 1 && ((l.engines >> (e | 0)) & 1) === 1;
}
async function auditionPatch(rq, info, pt, opt = {}) {
  if (lightRefuses(info, opt.track ?? 0, pt.engine))   /* ((Skiff W4) refused before anything is written) */
    throw new Error(`${info.engines[pt.engine] || pt.engine}: not on T${(opt.track ?? 0) + 1} (a light track)`);
  await rq(req.set(1, opt.gEng ?? 20, pt.engine));
  const dump = parse[CMD.DUMP](await rq(req.dump()), info);
  const n = Math.min(info.pcount, pt.p.length);
  for (let i = 0; i < n; i++) {
    const v = pt.p[i];
    if (opt.progress) opt.progress(i, n);
    if (v == null || v === dump.p[i] || trackOwn(i, info.pe0)) continue;
    await rq(req.set(0, i, v));
  }
  if (pt.fm6 && info.fm6)                         /* a converted DIGITAL sound: its own FM6 patch on the track */
    await rq(req.fm6Put(FM6.TARGET.TRACK, opt.track ?? 0, pt.fm6));
  return {};
}

/* WATCH on (asking for TRACK_CHANGED too): false when the firmware does not know it (older than protocol v2),
   else 1, or 3 when it also has TRACK_PARAM / TRACK_CHANGED (protocol v4) */
async function startWatch(rq) {
  try { const on = parse[CMD.WATCH](await rq(req.watch(3), { timeout: 300, retries: 1, quiet: true })).on; return on & 1 ? on & 3 : false; }
  catch (e) { if (e.message === "closed") throw e; return false; }
}

/* ------------------------------------------------------------ mixer (v3) --- */
/* The TRACKS page in the editor: TRACK (engine, preset, level, mute, armed of every track) and TRACK_DUMP
   of each track for its P_PAN. Level and mute go through TRACK_MIX (any track). Pan: TRACK_PARAM (v4, any track); with v3 firmware a plain SET, which reaches only the
   selected track: another track is selected for it and the selection is put back (TRACK pushes no
   RELOAD). ids: {pan: P_PAN id} */
const mixer = {
  async read(rq, info, ids, prev = null) {   /* prev: the tracks as last read: their pans kept, no TRACK_DUMP ((Skiff W7)) */
    const tr = parse[CMD.TRACK](await rq(req.track()));
    for (let i = 0; i < tr.ntrk; i++) {
      if (prev && prev[i]) { tr.tracks[i].pan = prev[i].pan; tr.tracks[i].rev = prev[i].rev ?? null; continue; }
      const d = parse[CMD.TRACK_DUMP](await rq(req.trackDump(i)), info);
      tr.tracks[i].pan = ids.pan == null ? null : d.p[ids.pan];
      tr.tracks[i].rev = ids.rev == null ? null : d.p[ids.rev];   /* ((Skiff W3) REV, the device's MIXER's too) */
    }
    return tr;
  },
  /* -> {track, level, mute} as the device has them now */
  async setMix(rq, track, level, mute, opt) { return parse[CMD.TRACK_MIX](await rq(req.trackMix(track, level, mute), opt)); },
  /* -> the pan value after clamping. v4: TRACK_PARAM, the selection stays */
  async setPan(rq, track, sel, panId, v, v4, key = "pan:" + track) {   /* ((Skiff W3) REV too: its id, its key) */
    if (v4) return parse[CMD.TRACK_PARAM](await rq(req.trackParam(track, panId, v), { key })).value;
    if (track === sel) return parse[CMD.SET](await rq(req.set(0, panId, v))).value;
    await rq(req.track(track));
    try { return parse[CMD.SET](await rq(req.set(0, panId, v))).value; }
    finally { await rq(req.track(sel)).catch(() => {}); }
  },
};

/* ------------------------------------------------------------ mock device --- */
/* Implements the protocol like firmware/src/editor.c, with tables copied from params.c
   and the engine sources (test_web.mjs checks them against the firmware's, tests/descdump.c). Used with ?mock=1 (add &legacy=1 for a firmware without cmds 16..26).
   opt: {legacy: no user bank / WATCH, v3: no TRACK_PARAM / TRACK_CHANGED (firmware 0.8),
         auto: false = no simulated knobs (tests drive sim.*),
         watchMs: how long WATCH lasts after the last request (3000), slots: user bank size (32)} */
/* ------------------------------------------------------------------- FM6 --- */
/* The FM6 engine's patches (eng_fm6.c, EDITOR_PROTOCOL.md "FM6 patches"): the generic 6-operator voice.
   voice: 155 bytes, 6 x 21 operator bytes (the sixth operator first, as the format has them), then 19 voice bytes
   and a 10-character name. packed: the 128-byte record of a 32-voice bank (every byte 7-bit). SysEx files: a
   single voice (F0 43 0n 00 01 1B, 155 bytes, checksum, F7: 163 bytes) or 32 packed voices (F0 43 0n 09 20 00,
   4096 bytes, checksum, F7: 4104 bytes); parseSysex also reads the variants real files have (see there). */
const FM6 = (() => {
  /* per operator byte: name, highest value; then the voice bytes */
  const OP = [["R1", 99], ["R2", 99], ["R3", 99], ["R4", 99], ["L1", 99], ["L2", 99], ["L3", 99], ["L4", 99],
    ["BP", 99], ["LD", 99], ["RD", 99], ["LC", 3], ["RC", 3], ["RS", 7], ["AMS", 3], ["KVS", 7], ["OL", 99],
    ["MODE", 1], ["FC", 31], ["FF", 99], ["DET", 14]];
  const VOICE = [["PR1", 99], ["PR2", 99], ["PR3", 99], ["PR4", 99], ["PL1", 99], ["PL2", 99], ["PL3", 99], ["PL4", 99],
    ["ALG", 31], ["FB", 7], ["OKS", 1], ["LFS", 99], ["LFD", 99], ["LPMD", 99], ["LAMD", 99], ["LKS", 1], ["LFW", 5],
    ["LPMS", 7], ["TRNSP", 48]];
  const OPI = Object.fromEntries(OP.map(([n], i) => [n, i])), VI = Object.fromEntries(VOICE.map(([n], i) => [n, 126 + i]));
  const NAME = 145, SIZE = 155, PACKED = 128;
  const max = (i) => (i < 126 ? OP[i % 21][1] : i < NAME ? VOICE[i - 126][1] : 126);
  /* byte i of operator n (1..6) */
  const at = (n, field) => (6 - n) * 21 + OPI[field];
  function sanitize(v) {
    const o = Uint8Array.from(v.slice(0, SIZE));
    for (let i = 0; i < SIZE; i++) o[i] = i >= NAME ? (o[i] < 32 || o[i] > 126 ? 32 : o[i]) : Math.min(o[i], max(i));
    return o;
  }
  function unpack(b) {                            /* eng_fm6.c fm6_unpack */
    const v = new Uint8Array(SIZE);
    for (let k = 0; k < 6; k++) {
      const o = k * 17, d = k * 21;
      for (let i = 0; i < 11; i++) v[d + i] = b[o + i] & 127;
      v[d + 11] = b[o + 11] & 3; v[d + 12] = b[o + 11] >> 2 & 3; v[d + 13] = b[o + 12] & 7; v[d + 20] = b[o + 12] >> 3 & 15;
      v[d + 14] = b[o + 13] & 3; v[d + 15] = b[o + 13] >> 2 & 7; v[d + 16] = b[o + 14] & 127; v[d + 17] = b[o + 15] & 1;
      v[d + 18] = b[o + 15] >> 1 & 31; v[d + 19] = b[o + 16] & 127;
    }
    for (let i = 0; i < 9; i++) v[126 + i] = b[102 + i] & 127;
    v[134] &= 31; v[135] = b[111] & 7; v[136] = b[111] >> 3 & 1;
    for (let i = 0; i < 4; i++) v[137 + i] = b[112 + i] & 127;
    v[141] = b[116] & 1; v[142] = b[116] >> 1 & 7; v[143] = b[116] >> 4 & 7; v[144] = b[117] & 127;
    for (let i = 0; i < 10; i++) v[NAME + i] = b[118 + i] & 127;
    return sanitize(v);
  }
  function pack(v) {                              /* eng_fm6.c fm6_pack */
    const b = new Array(PACKED).fill(0);
    for (let k = 0; k < 6; k++) {
      const o = k * 17, d = k * 21;
      for (let i = 0; i < 11; i++) b[o + i] = v[d + i] & 127;
      b[o + 11] = (v[d + 11] & 3) | (v[d + 12] & 3) << 2; b[o + 12] = (v[d + 13] & 7) | (v[d + 20] & 15) << 3;
      b[o + 13] = (v[d + 14] & 3) | (v[d + 15] & 7) << 2; b[o + 14] = v[d + 16] & 127;
      b[o + 15] = (v[d + 17] & 1) | (v[d + 18] & 31) << 1; b[o + 16] = v[d + 19] & 127;
    }
    for (let i = 0; i < 9; i++) b[102 + i] = v[126 + i] & 127;
    b[110] &= 31; b[111] = (v[135] & 7) | (v[136] & 1) << 3;
    for (let i = 0; i < 4; i++) b[112 + i] = v[137 + i] & 127;
    b[116] = (v[141] & 1) | (v[142] & 7) << 1 | (v[143] & 7) << 4; b[117] = v[144] & 127;
    for (let i = 0; i < 10; i++) b[118 + i] = v[NAME + i] & 127;
    return b;
  }
  const name = (v) => String.fromCharCode(...v.slice(NAME, NAME + 10)).replace(/\s+$/, "");
  function setName(v, s) {
    const t = String(s).toUpperCase().replace(/[^\x20-\x7E]/g, " ").slice(0, 10).padEnd(10, " ");
    for (let i = 0; i < 10; i++) v[NAME + i] = t.charCodeAt(i);
    return v;
  }
  const checksum = (a) => (128 - (a.reduce((s, x) => s + x, 0) & 127)) & 127;
  /* every voice in a file's bytes, tolerant of what real files have:
     - SysEx F0 43 0n 00 xx xx (one voice, 155 bytes) and F0 43 0n 09 xx xx (32 packed voices, 4096 bytes): the byte
       count is not checked (some tools write 09 10 00, i.e. 0x1000 as two plain bytes); the payload is taken right
       after the 6-byte header whatever follows it: a checksum or not, F7 or not, a stray byte, the next F0;
       a message cut short (EOF, or a byte >= 0x80 inside it) keeps its whole voices (the name may be cut: blanks);
     - several messages in one file, junk before / between / after them;
     - the format's other blocks (manufacturer 43h: supplements, performances, 4-operator voices, universal "LM  ..." blocks) and other
       makers' messages are skipped and counted;
     - raw data without SysEx: 4096 x n bytes (banks), 155 (one voice) or 128 bytes (one packed voice).
     -> {voices: [{name, v}], badSum: messages with a wrong checksum (still read), short: messages cut short,
         skipped: other messages, kinds: what the skipped ones were ("fm4" 4-operator voices, "other43" the format's other
         blocks, "universal", "maker:XX" another manufacturer id), sysex: F0 seen} */
  function parseSysex(bytes) {
    const d = Uint8Array.from(bytes), voices = [], kinds = [];
    let badSum = 0, short = 0, skipped = 0;
    const add = (v) => voices.push({ v, name: name(v) });
    const kind = (k) => { skipped++; if (!kinds.includes(k)) kinds.push(k); };
    const sysex = d.includes(0xF0);
    if (d[0] !== 0xF0 && !sysex) {
      if (d.length && d.length % 4096 === 0) {
        for (let o = 0; o < d.length; o += 128) add(unpack(d.subarray(o, o + 128)));
      } else if (d.length === SIZE) add(sanitize(d));
      else if (d.length === PACKED) add(unpack(d));
      return { voices, badSum, short, skipped, kinds, sysex };
    }
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== 0xF0) continue;
      const id = d[i + 1], st = d[i + 2], f = d[i + 3];
      if (id === 0x43 && st !== undefined && (st & 0xF0) === 0 && (f === 0 || f === 9) && i + 6 <= d.length) {
        const want = f === 0 ? SIZE : 4096, s = i + 6;
        let e = s;
        while (e < d.length && e < s + want && d[e] < 0x80) e++;
        const data = d.subarray(s, e);
        if (data.length < want) short++;
        else if (e < d.length && d[e] < 0x80 && checksum(data) !== d[e]) badSum++;
        if (f === 0) {
          if (data.length >= NAME) { const v = new Uint8Array(SIZE); v.set(data); add(sanitize(v)); }
        } else {
          for (let o = 0; o + 118 <= data.length; o += 128) {    /* whole voices, and one cut in its name (at 118) */
            const pk = new Uint8Array(128); pk.set(data.subarray(o, o + 128)); add(unpack(pk));
          }
        }
        i = e - 1;                      /* on to the next F0 (the checksum, F7, junk are passed over) */
        continue;
      }
      if (id === 0x43) kind(f === 3 || f === 4 ? "fm4" : "other43");
      else if (id === 0x7E || id === 0x7F) kind("universal");
      else if (id !== undefined && id < 0x80) kind("maker:" + (id === 0 ? [0, d[i + 2], d[i + 3]] : [id])
        .map((x) => (x ?? 0).toString(16).toUpperCase().padStart(2, "0")).join(" "));
    }
    return { voices, badSum, short, skipped, kinds, sysex };
  }
  function singleSysex(v, ch = 0) {
    const data = Array.from(sanitize(v));
    return Uint8Array.from([0xF0, 0x43, ch & 15, 0, 0x01, 0x1B, ...data, checksum(data), 0xF7]);
  }
  function bankSysex(voices, ch = 0) {            /* up to 32 voices (155 bytes each), the rest the init voice */
    const data = [];
    for (let k = 0; k < 32; k++) data.push(...(voices[k] ? pack(voices[k]) : INIT_PK));
    return Uint8Array.from([0xF0, 0x43, ch & 15, 9, 0x20, 0, ...data, checksum(data), 0xF7]);
  }
  /* the 32 algorithms (msfa's tables; fm6_core.c FM6_ALG): per operator, the sixth first */
  const ALG = [[0xc1, 0x11, 0x11, 0x14, 0x01, 0x14], [0x01, 0x11, 0x11, 0x14, 0xc1, 0x14], [0xc1, 0x11, 0x14, 0x01, 0x11, 0x14],
    [0xc1, 0x11, 0x94, 0x01, 0x11, 0x14], [0xc1, 0x14, 0x01, 0x14, 0x01, 0x14], [0xc1, 0x94, 0x01, 0x14, 0x01, 0x14],
    [0xc1, 0x11, 0x05, 0x14, 0x01, 0x14], [0x01, 0x11, 0xc5, 0x14, 0x01, 0x14], [0x01, 0x11, 0x05, 0x14, 0xc1, 0x14],
    [0x01, 0x05, 0x14, 0xc1, 0x11, 0x14], [0xc1, 0x05, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x05, 0x14, 0xc1, 0x14],
    [0xc1, 0x05, 0x05, 0x14, 0x01, 0x14], [0xc1, 0x05, 0x11, 0x14, 0x01, 0x14], [0x01, 0x05, 0x11, 0x14, 0xc1, 0x14],
    [0xc1, 0x11, 0x02, 0x25, 0x05, 0x14], [0x01, 0x11, 0x02, 0x25, 0xc5, 0x14], [0x01, 0x11, 0x11, 0xc5, 0x05, 0x14],
    [0xc1, 0x14, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x14, 0xc1, 0x14, 0x14], [0x01, 0x14, 0x14, 0xc1, 0x14, 0x14],
    [0xc1, 0x14, 0x14, 0x14, 0x01, 0x14], [0xc1, 0x14, 0x14, 0x01, 0x14, 0x04], [0xc1, 0x14, 0x14, 0x14, 0x04, 0x04],
    [0xc1, 0x14, 0x14, 0x04, 0x04, 0x04], [0xc1, 0x05, 0x14, 0x01, 0x14, 0x04], [0x01, 0x05, 0x14, 0xc1, 0x14, 0x04],
    [0x04, 0xc1, 0x11, 0x14, 0x01, 0x14], [0xc1, 0x14, 0x01, 0x14, 0x04, 0x04], [0x04, 0xc1, 0x11, 0x14, 0x04, 0x04],
    [0xc1, 0x14, 0x04, 0x04, 0x04, 0x04], [0xc4, 0x04, 0x04, 0x04, 0x04, 0x04]];
  /* operators 1..6 that are carriers (on the output bus), and the one with the feedback, of algorithm a (0..31) */
  const carriers = (a) => [1, 2, 3, 4, 5, 6].filter((n) => !(ALG[a & 31][6 - n] & 3));
  const feedbackOp = (a) => [1, 2, 3, 4, 5, 6].find((n) => (ALG[a & 31][6 - n] & 0xc0) === 0xc0);
  /* an operator's frequency as text: x ratio, or Hz for a fixed one (msfa note osc_freq) */
  function freqText(v, n) {
    const fc = v[at(n, "FC")], ff = v[at(n, "FF")];
    if (v[at(n, "MODE")]) return (10 ** ((fc & 3) + ff / 100)).toPrecision(4) + " Hz";
    return "x" + ((fc ? fc : 0.5) * (1 + ff / 100)).toFixed(2);
  }
  const INIT_PK = [99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,99,2,0,99,99,99,99,50,50,50,50,0,8,35,0,0,0,49,24,73,78,73,84,32,86,79,73,67,69];
  const FACTORY_PK = [
    [95,40,30,60,99,80,0,0,39,0,0,0,56,12,52,2,0,95,30,20,60,99,90,0,0,39,0,0,0,48,4,78,2,0,97,62,40,60,99,60,0,0,39,0,0,0,59,24,68,28,0,95,20,20,50,99,95,0,0,39,0,0,0,66,8,90,2,0,95,50,35,78,99,75,0,0,39,0,0,0,59,28,58,2,0,96,25,25,67,99,75,0,0,39,0,0,0,59,8,98,2,0,99,99,99,99,50,50,50,50,4,11,34,33,0,0,41,24,84,73,78,69,32,69,80,32,32,32],   /* TINE EP */
    [99,60,40,45,99,50,0,0,39,0,0,0,56,0,60,2,0,99,60,40,45,99,50,0,0,39,0,0,0,40,0,78,10,40,99,50,30,40,99,60,0,0,39,0,0,0,56,12,70,10,0,99,45,30,40,99,70,0,0,39,0,0,0,72,4,84,4,38,99,35,25,35,99,70,0,0,39,0,0,0,56,12,78,6,50,99,40,25,35,99,80,0,0,39,0,0,0,56,4,96,2,0,99,99,99,99,50,50,50,50,4,8,35,0,0,0,1,24,71,76,65,83,83,32,66,69,76,76],   /* BELL */
    [99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,72,50,75,99,65,40,0,39,0,0,0,56,24,78,4,0,99,55,40,75,99,70,50,0,39,0,0,0,64,4,80,2,0,99,60,40,75,99,72,55,0,39,0,0,0,56,20,80,2,0,99,40,30,75,99,85,70,0,39,0,0,0,56,8,99,2,0,99,99,99,99,50,50,50,50,4,8,35,0,0,0,1,24,82,79,85,78,68,32,66,65,83,83],   /* FM BASS */
    [52,50,40,60,99,85,82,0,39,0,0,0,56,8,72,2,0,62,50,40,60,99,92,90,0,39,0,0,0,40,4,88,2,0,50,50,40,60,99,88,85,0,39,0,0,0,56,12,78,2,0,62,50,40,60,99,92,90,0,39,0,0,0,72,4,92,2,0,55,50,40,60,99,88,85,0,39,0,0,0,56,12,80,2,0,65,50,40,60,99,92,90,0,39,0,0,0,56,4,98,2,0,80,60,99,60,46,50,50,50,4,13,33,50,6,0,57,24,66,82,65,83,83,32,83,69,67,84],   /* BRASS */
    [35,30,40,40,85,90,85,0,39,0,0,0,56,0,50,2,0,38,30,40,40,99,95,90,0,39,0,0,0,56,0,80,4,0,30,25,40,40,80,90,85,0,39,0,0,0,56,4,55,4,0,40,30,40,40,99,95,90,0,39,0,0,0,80,0,92,2,0,35,30,40,40,85,90,80,0,39,0,0,0,56,4,60,2,0,40,30,40,40,99,95,90,0,39,0,0,0,40,0,92,2,0,99,99,99,99,50,50,50,50,4,10,30,60,4,0,41,24,83,79,70,84,32,80,65,68,32,32],   /* PAD */
    [99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,80,50,60,99,0,0,0,39,0,0,0,59,12,45,2,0,99,70,50,60,99,0,0,0,39,0,0,0,59,12,72,8,0,99,75,50,60,99,0,0,0,39,0,0,0,59,20,70,8,0,99,52,40,55,99,0,0,0,39,0,0,0,58,8,99,2,0,99,99,99,99,50,50,50,50,4,8,35,0,0,0,1,24,87,79,79,68,32,66,65,82,83,32],   /* MARIMBA */
    [99,99,99,85,99,99,99,0,39,0,0,0,56,0,72,2,50,99,99,99,85,99,99,99,0,39,0,0,0,56,0,78,8,0,99,99,99,85,99,99,99,0,39,0,0,0,56,0,76,6,0,99,99,99,85,99,99,99,0,39,0,0,0,56,0,86,4,0,99,99,99,85,99,99,99,0,39,0,0,0,56,0,84,0,0,99,99,99,85,99,99,99,0,39,0,0,0,56,0,90,2,0,99,99,99,99,50,50,50,50,31,8,60,0,3,0,57,24,68,82,65,87,66,65,82,83,32,32],   /* ORGAN */
    [99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,99,99,99,99,99,99,0,39,0,0,0,56,0,0,2,0,99,75,40,60,99,30,0,0,39,0,0,0,58,12,68,2,0,99,60,40,60,99,30,0,0,39,0,0,0,66,8,74,4,0,99,70,40,60,99,40,0,0,39,0,0,0,58,16,76,6,0,99,45,30,60,99,60,0,0,39,0,0,0,58,8,98,2,0,99,99,99,99,50,50,50,50,4,8,35,0,0,0,1,24,78,89,76,79,78,32,80,73,67,75],   /* PLUCK */
  ];
  const init = () => unpack(INIT_PK);
  const factory = (k) => unpack(FACTORY_PK[k]);
  return { OP, VOICE, OPI, VI, NAME, SIZE, PACKED, max, at, sanitize, unpack, pack, name, setName, checksum, parseSysex,
    singleSysex, bankSysex, ALG, carriers, feedbackOp, freqText, INIT_PK, FACTORY_PK, init, factory,
    TARGET: { TRACK: 0, BANK: 1, FACTORY: 2, USER: 3 } };
})();

/* ----------------------------------------------------------------- DIGITAL --- */
/* DIGITAL (engine 1, four-operator FM) was replaced by FM6 (1.0): the firmware keeps engine 1 reserved (its name
   "-"; a FELUCCA_FM4=1 build has DIGITAL back) and turns every DIGITAL sound into an FM6 one with a patch of its own
   (src/fm4_convert.c). This is the same conversion (test_web.mjs: == the firmware's, build/host/desc.json "FM4"), for
   library files and device slots of DIGITAL sounds. convert(p, pe0): p the values as DIGITAL has them (null: its
   defaults), P_E0 at pe0 (the OP ENV values at 61..80 when pe0 >= 81) -> {p: FM6's (the macros neutral, PTCH the
   nearest factory patch, the OP ENV values their defaults), voice: the 155-byte patch, preset: FM6's that covers it} */
const FM4 = (() => {
  const P = (name, e, env, fenv, mono, fx, pat) => ({ name, e, env, fenv, mono, fx, pat });
  const PRESETS = [   /* src/fm4_convert.c DIGITAL_PRESETS (fx: the sends) */
    P("E.PIANO", [4, 1, 1, 14, 70, 55, 0, 0], [0, 80, 40, 60], 0, 0, [0, 50, 25, 35], 6),
    P("BELL", [4, 8, 1, 4, 90, 70, 0, 0], [0, 95, 0, 85], 0, 0, [0, 0, 30, 70], 7),
    P("BASS", [0, 1, 1, 1, 48, 40, 8, 0], [0, 60, 70, 25], 0, 1, [0, 0, 10, 10], 2),
    P("BRASS", [0, 1, 1, 1, 70, 40, 20, 0], [40, 70, 100, 40], 20, 0, [0, 20, 20, 40], 6),
    P("ORGAN", [7, 2, 3, 4, 0, 0, 0, 0], [2, 60, 127, 20], 0, 0, [10, 40, 0, 30], 6),
    P("PAD", [5, 2, 1, 3, 40, 90, 10, 0], [80, 90, 110, 95], 0, 0, [0, 60, 30, 70], 5),
    P("MARIMBA", [4, 4, 1, 1, 60, 30, 0, 0], [0, 80, 0, 60], 0, 0, [0, 0, 25, 40], 3),
    P("FUNK KEY", [3, 1, 3, 5, 90, 25, 20, 0], [0, 45, 30, 30], 0, 0, [0, 20, 30, 20], 6)];
  const TO_FM6 = [0, 1, 2, 3, 6, 4, 5, 7];        /* DIGITAL preset k -> the FM6 preset (its PTCH) covering it */
  const ALG = [[0, [3, 4, 5, 6], [1, 1, 1, 1]], [13, [3, 4, 5, 6], [1, 1, 2, 2]], [7, [3, 5, 6, 4], [1, 2, 1, 2]],
    [6, [3, 4, 5, 6], [1, 2, 2, 1]], [4, [1, 2, 5, 6], [2, 1, 2, 1]], [21, [3, 4, 5, 6], [3, 3, 3, 1]],
    [28, [1, 2, 5, 6], [3, 3, 3, 1]], [31, [1, 2, 3, 6], [4, 4, 4, 4]]];
  const MUTE = -100000, FB_NOISE = 20, FB_LIFT = 768, ATK = 1, DEC = 2, SUS = 3, REL = 4, ED_FLT = 5, OPENV = 61;
  const EDEF = [0, 1, 1, 1, 60, 60, 0, 0], TDEF = { 1: 10, 2: 70, 3: 90, 4: 60, 5: 0 };
  const MS10 = Array.from({ length: 128 }, (_, v) => Math.round(10 * 10000 ** (v / 127)));   /* TIME_MS_X10 */
  const LUT = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];
  const scaleout = (l) => (l >= 20 ? 28 + l : LUT[l < 0 ? 0 : l]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const div = (a, b) => Math.trunc(a / b);
  function lg(x) {                                 /* 256 log2(x) (fm4_lg) */
    if (!x) return MUTE;
    let n = 0;
    while (n < 31 && Math.floor(x / 2 ** (n + 1))) n++;
    const f = (n >= 8 ? Math.floor(x / 2 ** (n - 8)) : x * 2 ** (8 - n)) & 255;
    return n * 256 + f + Math.floor(f * (256 - f) * 89 / 65536);
  }
  const ms = (q) => (q ? lg(q) - 3840 : MUTE);
  const samples = (v) => Math.floor(MS10[v & 127] * 441 / 100);
  function rate(per) {
    const lt = lg(per < 1 ? 1 : per);
    let best = 0, bd = Infinity;
    for (let r = 0; r < 100; r++) {
      const q = (r * 41) >> 6, d = Math.abs(lg(Math.floor((1 << (22 - (q >> 2))) / (4 + (q & 3)))) - lt);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  const fall = (t, drop) => (drop <= 0 ? (drop === MUTE ? rate(div(t * 100, 664)) : 99) : rate(div(t * 111, drop)));
  function nearestLevel(m, f) {
    if (m <= MUTE) return 0;
    let best = 0, bd = Infinity;
    for (let l = 0; l < 100; l++) { const d = Math.abs(f(l) - m); if (d < bd) { bd = d; best = l; } }
    return best;
  }
  const level = (m) => nearestLevel(m, (l) => ((scaleout(l) >> 1) << 6) - 4032);
  const outlevel = (m) => nearestLevel(m, (l) => (scaleout(l) << 5) - 4064);
  function nearest(e) {
    let best = 0, bd = Infinity;
    PRESETS.forEach((pr, k) => {
      let d = ((e[0] & 7) !== pr.e[0]) * 1000;
      for (let i = 1; i < 7; i++) d += Math.abs(e[i] - pr.e[i]) * (i < 4 ? 8 : 1);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function convert(pin, pe0 = pin.length - 8) {
    const p = pin.slice(), v = new Array(156).fill(0), op = pe0 >= 81;
    const g = (i, d) => (p[i] == null ? d : p[i]);
    const ev = Array.from({ length: 8 }, (_, i) => g(pe0 + i, EDEF[i]));
    const tv = (i) => g(i, TDEF[i]);
    const alg = ev[0] & 7, near = nearest(ev);
    const idx = clamp(ev[4], 0, 127), fenv = clamp(tv(ED_FLT), -64, 63), sus = clamp(tv(SUS), 0, 127);
    const ipk = clamp(idx + fenv, 0, 127), isus = clamp(div(idx, 4) + div(fenv * sus, 127), 0, 127);
    const tAtt = samples(tv(ATK)), tMod = samples(ev[5]), car = FM6.carriers(ALG[alg][0]);
    let fb = MUTE;
    for (let k = 0; k < 6; k++) { const o = k * 21; v[o] = v[o + 1] = v[o + 2] = v[o + 3] = 99; v[o + 8] = 39; v[o + 18] = 1; v[o + 20] = 7; }
    v[134] = ALG[alg][0];
    for (let k = 0; k < 4; k++) {
      const e = op ? [0, 1, 2, 3, 4].map((i) => g(OPENV + k * 5 + i, i === 2 || i === 4 ? 127 : 0)) : [0, 0, 127, 0, 127];
      const opn = ALG[alg][1][k], share = ALG[alg][2][k], o = (6 - opn) * 21;
      const flat = !e[0] && !e[1] && e[2] === 127 && !e[3];
      const lvl = clamp(e[4], 0, 127) * 258, osus = flat ? 32767 : clamp(e[2], 0, 127) * 258;
      const tOdec = flat || e[2] === 127 ? 0 : e[1] ? samples(e[1]) : 1;
      const tOrel = flat ? 0x7FFFFFFF : e[3] ? samples(e[3]) : 0;
      const r = k ? (ev[k] >>> 0) % 15 : 1;
      let ta, td, tr, msS;
      v[o + 18] = k ? (r === 0 ? 0 : r <= 12 ? r : r === 13 ? 14 : 16) : 1;
      if (car.includes(opn)) {                     /* a carrier: the master envelope x the op's */
        v[o + 16] = outlevel(ms(Math.floor(lvl / share)) + 256 - 96);
        v[o + 15] = 3;
        ta = tAtt;
        if (!flat && e[0] && samples(e[0]) > ta) ta = samples(e[0]);
        const s = Math.floor(sus * 258 * osus / 32768);
        td = Math.max(sus < 127 ? samples(tv(DEC)) : 0, tOdec);
        tr = samples(tv(REL));
        if (!flat) tr = tOrel ? Math.floor((tr >> 5) * (tOrel >> 5) / ((tr >> 5) + (tOrel >> 5) + 1)) << 5 : 0;
        msS = ms(s);
        v[o] = rate(div(ta * 100, 146)); v[o + 4] = 99; v[o + 5] = v[o + 6] = level(msS);
        v[o + 1] = fall(td, msS === MUTE ? MUTE : -msS); v[o + 2] = 99; v[o + 3] = rate(div(tr * 100, 664)); v[o + 7] = 0;
        if (k === 3 && ev[6] && v[o + 16]) {
          const need = ms(Math.floor(ev[6] * 258 * lvl / 32768)) + 256;
          let out = (scaleout(v[o + 16]) << 5) - 4064 + (msS === MUTE ? -2048 : msS);
          if (ev[6] >= FB_NOISE && msS !== MUTE && out < need) {
            out += Math.min(need - out, FB_LIFT);
            v[o + 16] = outlevel(out - msS);
            out = (scaleout(v[o + 16]) << 5) - 4064 + msS;
          }
          fb = need - 256 - out;
        }
      } else {                                     /* a modulator: INDEX through MODDEC x the op's envelope */
        const a = Math.floor(Math.floor(ipk * lvl / 127) / share);
        const m = ipk ? Math.floor(Math.floor(isus * 32767 / ipk) * osus / 32768) : 0;
        let msA = ms(a);
        msS = ms(m);
        if (k === 3 && ev[6] && a) {
          const need = ms(Math.floor(ev[6] * 258 * lvl / 32768)) + 256;
          if (ev[6] >= FB_NOISE && msS !== MUTE && msA + msS < need) {
            const t = msA + msS + Math.min(need - (msA + msS), FB_LIFT);
            if (t <= msA) msS = t - msA;
            else { msS = 0; msA = t > 0 ? 0 : t; }
          }
          fb = need - 256 - (msA + (msS === MUTE ? -2048 : msS));
        }
        v[o + 16] = outlevel(msA); v[o + 15] = a ? 1 : 0;
        ta = fenv > 0 ? div(tAtt * fenv, idx + fenv) : 0;
        if (!flat && e[0] && samples(e[0]) > ta) ta = samples(e[0]);
        td = Math.max(msS < 0 ? (isus < ipk ? tMod : 0) : 0, tOdec);
        v[o] = rate(div(ta * 100, 146)); v[o + 4] = 99; v[o + 5] = v[o + 6] = level(msS);
        v[o + 1] = fall(td, msS === MUTE ? MUTE : -msS); v[o + 2] = 99;
        if (flat) { v[o + 3] = v[o + 1]; v[o + 7] = v[o + 6]; }
        else { v[o + 3] = tOrel ? rate(div(tOrel * 100, 664)) : 99; v[o + 7] = 0; }
      }
    }
    fb += 8 * 256 + 128;                           /* FM6 feedback: deviation = output x 2^(FB - 8) */
    if (ev[6] && fb > 0) v[135] = Math.min(div(fb, 256), 7);
    for (let k = 0; k < 4; k++) { v[126 + k] = 99; v[130 + k] = 50; }
    v[136] = 1; v[137] = 35; v[144] = 24;
    const same = PRESETS.find((pr) => pr.env.every((x, i) => x === tv(ATK + i)) && pr.e.slice(0, 7).every((x, i) => x === ev[i]));
    FM6.setName(v, same ? same.name : `4OP ALG ${alg + 1}`);
    for (let k = 0; k < 7; k++) p[pe0 + k] = 0;
    p[pe0 + 7] = TO_FM6[near];
    if (op) for (let i = 0; i < 20; i++) p[OPENV + i] = i % 5 === 2 || i % 5 === 4 ? 127 : 0;
    return { p, voice: FM6.sanitize(v), preset: TO_FM6[near] };
  }
  /* preset k's values into p (src/fm4_convert.c fm4_preset_values: EDIT, ENV, ENV -> FLT, VOICE, sends, OP ENV) */
  function presetValues(p, k, pe0 = p.length - 8) {
    const pr = PRESETS[k % PRESETS.length];
    pr.e.forEach((x, i) => { p[pe0 + i] = x; });
    pr.env.forEach((x, i) => { p[ATK + i] = x; });
    p[ED_FLT] = pr.fenv; p[37] = pr.mono ? 2 : 0;
    pr.fx.forEach((x, i) => { p[33 + i] = x; });
    if (pe0 >= 81) for (let i = 0; i < 20; i++) p[OPENV + i] = i % 5 === 2 || i % 5 === 4 ? 127 : 0;
    return p;
  }
  return { PRESETS, TO_FM6, ALG, convert, presetValues };
})();
/* a DIGITAL sound for a device / library without DIGITAL (engines: its names; "-" at 1 = reserved) -> the FM6 patch
   that replaces it: {..., engine: FM6's index, engineName "FM6", p, fm6: packed, fm4: the DIGITAL values}; null when
   the engines have no FM6. A device's slot of engine 1 holds such a sound (its record kept: the device converts it) */
function fromDigital(pt, engines, pe0) {
  const fm6 = engines && engines.length ? engines.indexOf("FM6") : 12;
  if (fm6 < 0) return null;
  const src = Array.from(pt.p || pt.params || []);
  const r = FM4.convert(src, pe0 ?? src.length - 8);
  return { ...pt, engine: fm6, engineName: "FM6", p: r.p, params: undefined, fm6: FM6.pack(r.voice), fm4: src };
}
const reservedFm4 = (engines, e) => e === 1 && (engines || [])[1] === "-";   /* a device's slot of a DIGITAL sound */
/* SAMPLE SET 4 was PERC, the GM drum kit (retired after 1.0.2; src/core.h drum_from_perc): a sound of it is the DRUM
   engine with its default kit (eng_drum.c DRUM_PRESETS[0], the same GM key map); the rest of its values stay. engines:
   the names ("SAMPLE", "DRUM"; none: the firmware's indices 4, 10), pe0: P_E0 in its p. -> the DRUM patch, or null when
   pt is no such sound or there is no DRUM. The device converts its own (projects, user presets) the same way */
const PERC_SET = 4, DRUM_KIT_E = [0, 64, 70, 64, 64, 100, 0, 0];
function fromPerc(pt, engines, pe0) {
  const names = engines && engines.length ? engines : null;
  const name = pt.engineName || (names || [])[pt.engine];
  const p = pt.p || pt.params, drum = names ? names.indexOf("DRUM") : 10;
  if ((name ? name !== "SAMPLE" : pt.engine !== 4) || !Array.isArray(p) || drum < 0) return null;
  const e0 = pe0 ?? p.length - 8;
  if (p[e0] !== PERC_SET) return null;
  const q = p.slice();
  DRUM_KIT_E.forEach((v, i) => { q[e0 + i] = v; });
  return { ...pt, engine: drum, engineName: "DRUM", p: q, params: undefined };
}
/* an engine's name to show: the reserved engine 1 holds DIGITAL sounds that play as FM6 */
const engineLabel = (engines, e) => (e === 1 && (engines || [])[1] === "-" ? "FM6" : (engines || [])[e] ?? String(e));

function makeMockDevice(opt = {}) {
  const NONOFF = ["OFF", "ON"], NDIV = ["1/4", "1/8", "1/16", "1/32", "8T", "16T", "1/2", "1/1", "2BAR", "4BAR"], NGO = ["--", "GO"], NDASH = ["--"];
  const D = (label, fmt, min, max, def, names = null, unit = "") => ({ label, fmt, min, max, def, names, unit });
  const E = (label, names, def) => D(label, F.ENUM, 0, names.length - 1, def, names);
  const MSRC = ["OFF", "LFO", "ENV", "VEL", "KEY", "RAND", "MODW", "AT", "EXPR", "ENV2", "S&H", "SLEW"];   /* ((Skiff phase 9) ENV2;
                                                       (1.3) S&H SLEW) */
  const MDST = ["OFF", "PITCH", "CUT", "SHP", "AMP", "PAN", "DIST", "CHO", "DLY", "REV", "RATE", "VIB", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8",
    "DEPTH", "VEL", "TIME"];                       /* ((1.3) the LFO's depth; at a note: VEL, TIME) */
  const TP = [
    D("LEVEL", F.DB, 0, 127, 104),
    D("ATTACK", F.TIME, 0, 127, 10), D("DECAY", F.TIME, 0, 127, 70), D("SUSTAIN", F.PCT, 0, 127, 90), D("RELEASE", F.TIME, 0, 127, 60),
    D("CUTOFF", F.BIPCT, -64, 63, 0), D("PITCH", F.BIPCT, -64, 63, 0), D("SHAPE", F.BIPCT, -64, 63, 0), D("FX", F.BIPCT, -64, 63, 0),
    D("RATE", F.LFOHZ, 0, 127, 60), E("WAVE", ["SIN", "TRI", "SAW", "SQR", "S&H"], 0), D("PHASE", F.INT, 0, 127, 0), D("FADE", F.TIME, 0, 127, 0),
    D("PITCH", F.BIPCT, -64, 63, 0), D("CUTOFF", F.BIPCT, -64, 63, 0), D("SHAPE", F.BIPCT, -64, 63, 0), D("AMP", F.PCT, 0, 127, 0),
    E("MODE", ["OFF", "UP", "DN", "UPDN", "RND", "ORD", "REPEAT", "DNUP", "UP+8", "CONV", "DIVG", "PINKY", "THUMB", "WALK", "CHORD"], 0), E("RATE", NDIV, 2), D("OCTAVE", F.INT, 1, 4, 1), D("GATE", F.PCT, 1, 127, 64),
    D("SWING", F.PCT, 0, 100, 0), D("CHANCE", F.PCT, 0, 127, 127), E("HOLD", NONOFF, 0), E("ORDER", ["NOTE", "PLAYED"], 0),
    D("ROOT", F.NOTE, 0, 11, 0), E("SCALE", ["CHR", "MAJ", "MIN", "DOR", "MIX", "PEN", "MPEN", "HARM", "PHRY", "LYD", "LOC", "MEL", "BLUES", "WHOLE", "DIMHW", "DIMWH"], 0), E("QUANTIZE", ["OFF", "SNAP", "WHITE", "SEQ", "SEQ+T", "SOLO"], 0), D("TRANSP", F.SEMI, -24, 24, 0),
    D("LENGTH", F.STEPS, 1, 64, 16), E("DIV", NDIV, 2), D("SWING", F.PCT, 0, 100, 0), D("GATE", F.PCT, 1, 127, 127),   /* ((2.0) 1 STEP) */
    D("DIST", F.PCT, 0, 127, 0), D("CHORUS", F.PCT, 0, 127, 0), D("DELAY", F.PCT, 0, 127, 0), D("REVERB", F.PCT, 0, 127, 0),
    E("VOICE", ["POLY", "MONO", "LEG", "UNI"], 0), D("GLIDE", F.TIME, 0, 127, 0), D("PAN", F.BIPCT, -64, 63, 0), E("MUTE", NONOFF, 0),
    E("GL MODE", ["RATE", "TIME"], 0), E("PRIORITY", ["LAST", "LOW", "HIGH"], 0), E("ALLOC", ["ROT", "REUSE"], 0), D("DETUNE", F.INT, 0, 127, 40),
    E("SLICER", ["OFF", "GATE", "STUT"], 0), D("PATTERN", F.INT, 1, 16, 1), E("RATE", ["1/8", "1/16", "1/32", "8T", "16T", "32T"], 1), D("DEPTH", F.PCT, 0, 127, 127),
    ...[1, 2, 3, 4].flatMap((k) => [E("SRC" + k, MSRC, 0), E("DEST" + k, MDST, 0), D("AMT" + k, F.BIPCT, -64, 63, 0)]),   /* the matrix */
  ];
  const GP = [
    D("BPM", F.BPM, 40, 240, 120), D("SWING+", F.PCT, 0, 100, 0), E("CLOCK", ["INT", "USB", "TRS"], 0), D("TUNE", F.INT, -50, 50, 0),
    E("TIME", [...NDIV, "1/8D", "1/16D", "1/4D"], 1), D("FEEDBACK", F.PCT, 0, 120, 60),   /* ((1.3) the dotted ones) */ D("COLOR", F.PCT, 0, 127, 70), D("MIX", F.PCT, 0, 127, 90),
    D("SIZE", F.PCT, 0, 127, 90), D("DAMP", F.PCT, 0, 127, 60), D("RATE", F.LFOHZ, 0, 127, 40), D("DEPTH", F.PCT, 0, 127, 60),
    E("MIDI", ["USB", "TRS"], 0), E("SYNC", NDASH, 0), E("ROUTE", ["CH1-6", "SEL"], 0), D("CPU", F.INT, 0, 0, 0),
    D("SLOT", F.INT, 1, 4, 1), E("NAME", NDASH, 0), E("LOAD", NGO, 0), E("SAVE", NGO, 0),
    E("ENGINE", ["ANALOG", "-", "PHASE", "LOFI", "SAMPLE", "VOICE", "TRIO", "WHEEL",
      "GRAIN", "PHYS", "DRUM", "NOISE", "FM6", "SLICE", "DRUM-X"], 0), E("SET", NGO, 0),
    E("CLRSQ", NGO, 0), E("INIT", NGO, 0),
    E("TYPE", ["ROOM", "SPRING", "HALL"], 0),       /* G_RTYPE (id 24, was G_DRCH): the reverb's model ((Skiff phase 9) HALL) */
    E("MODE", ["CHORUS", "FLANGER", "PHASER"], 0), D("FEEDBACK", F.PCT, 0, 127, 0),   /* 25, 26: (Skiff phase 9) the CHORUS bus
                                                       (G_CMODE, G_CFDBK; G_DRLVL, G_DRREV before: inert since 1.0) */
  ];
  const NONE = D("-", F.INT, 0, 0, 0);
  const RATIO = [".5", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16"];
  const P = (name, e, env = [10, 70, 90, 60], mono = 0, pat = 0, more = []) => ({ name, e, env, mono, pat, more });
  const ENG = [
    { name: "ANALOG", titles: ["OSC", "FLT"], edit: [E("WAVE", ["SAW", "SQR", "TRI", "SIN", "PWM", "SYNC", "SUB"], 0), D("DETUNE", F.INT, 0, 127, 10, null, "ct"), D("MIX", F.PCT, 0, 127, 64),
        D("NOISE", F.PCT, 0, 127, 0), D("CUTOFF", F.CUTOFF, 0, 127, 90), D("RES", F.PCT, 0, 127, 30), D("DRIVE", F.PCT, 0, 127, 0), D("KEYTRK", F.PCT, 0, 127, 64)],
      presets: [P("SAW LEAD", [0, 12, 64, 0, 90, 30, 10, 64], [4, 70, 100, 50], 1, 4), P("SOFT PAD", [0, 20, 64, 4, 60, 10, 0, 32], [80, 90, 110, 95], 0, 5),
        P("SQR BASS", [1, 0, 0, 0, 50, 70, 40, 64], [0, 60, 40, 30], 1, 2), P("PWM STR", [4, 8, 40, 0, 75, 20, 0, 48], [60, 80, 110, 85], 0, 5),
        P("ACID", [0, 0, 0, 0, 50, 100, 25, 64], [0, 55, 20, 30], 1, 1), P("SINE KEY", [3, 6, 50, 0, 127, 0, 0, 0], [2, 80, 30, 70], 0, 6),
        P("RAVE", [4, 30, 64, 0, 85, 20, 30, 64], [20, 80, 110, 60], 1, 13), P("SUB BASS", [3, 0, 0, 0, 40, 0, 20, 0], [0, 60, 100, 20], 1, 8),
        P("SYNTH PLUCK", [0, 8, 50, 0, 30, 40, 0, 64], [0, 88, 0, 60], 0, 3), P("SYNTH BRASS", [0, 10, 64, 0, 45, 20, 10, 64], [35, 70, 90, 45], 0, 6),
        P("WIND SWEEP", [0, 0, 0, 90, 30, 90, 0, 0], [60, 90, 60, 80], 0, 5), P("STRINGS", [4, 6, 64, 0, 92, 8, 0, 48], [48, 90, 118, 72], 0, 5, [[15, 20], [9, 72], [13, 8], [12, 80]]),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("BONE FLUTE", [2, 3, 30, 22, 84, 15, 0, 64], [56, 80, 110, 64], 1, 0, [[9, 84], [12, 90], [13, 8]]),
        P("WAR HORN", [0, 5, 64, 4, 42, 12, 20, 64], [72, 80, 110, 80], 1, 0, [[9, 80], [12, 96], [13, 8]]),
        P("DARK STRINGS", [1, 4, 64, 6, 40, 34, 22, 40], [100, 90, 120, 105], 0, 0, [[9, 30], [14, 8], [13, 8], [12, 110]]),
        P("NIGHT BASS", [0, 7, 64, 0, 40, 35, 15, 64], [0, 64, 50, 30], 1),
        P("NEON LEAD", [0, 14, 64, 0, 92, 25, 12, 64], [6, 70, 110, 55], 1, 0, [[9, 86], [12, 92], [13, 11], [38, 28]]),
        P("SUNSET PAD", [4, 9, 55, 0, 74, 15, 0, 48], [78, 90, 115, 92], 0, 0, [[10, 1], [9, 52], [15, 48]]),
        P("HERO BRASS", [0, 16, 64, 0, 50, 18, 8, 56], [50, 75, 95, 55]),
        P("SYN TOM", [3, 0, 0, 6, 127, 0, 25, 0], [0, 76, 0, 60], 0, 0, [[6, 63]]),
        P("QUANTA", [3, 0, 0, 0, 127, 0, 0, 0], [0, 64, 127, 50], 1, 0, [[10, 4], [9, 96], [13, 50]]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("REESE", [0, 40, 64, 0, 52, 15, 30, 32], [0, 64, 127, 30], 1, 0, [[9, 30], [14, 8]]),
        P("DRIVE BASS", [0, 14, 64, 0, 62, 20, 10, 64], [0, 64, 64, 25], 1, 0, [[95, 1], [96, -32]]),
        /* (1.3, from Felucca) WAVE SYNC and SUB */
        P("HARD SYNC", [5, 36, 96, 0, 88, 24, 12, 64], [2, 70, 96, 40], 1, 0, [[7, 44], [38, 20]]),
        P("SUB SAW", [6, 0, 80, 0, 70, 22, 6, 64], [0, 60, 110, 22], 1)] },
    /* 1: reserved (DIGITAL, retired: src/fm4_convert.c ENG_FM4_GONE; its sounds load as FM6, FM4 above) */
    { name: "-", titles: ["-", "-"], edit: [D("-", F.INT, 0, 7, 0), D("-", F.INT, 0, 14, 1), D("-", F.INT, 0, 14, 1),
        D("-", F.INT, 0, 14, 1), D("-", F.PCT, 0, 127, 60), D("-", F.INT, 0, 127, 60), D("-", F.PCT, 0, 127, 0), NONE],
      presets: [] },
    { name: "PHASE", titles: ["PHASE", "LINE"], edit: [E("WAVE", ["SAW", "SQR", "PLS", "DSIN", "SPLS", "RSAW", "RTRI", "RTRP"], 0),
        E("WAVE2", ["-", "SAW", "SQR", "PLS", "DSIN", "SPLS", "RSAW", "RTRI", "RTRP"], 0), D("DCW", F.PCT, 0, 127, 60), D("ENV", F.PCT, 0, 127, 64),
        D("DETUNE", F.INT, 0, 127, 0, null, "ct"), E("LINE", ["MIX", "RING"], 0), D("SUB", F.PCT, 0, 127, 0), D("FOLD", F.PCT, 0, 127, 0)],   /* ((1.3) FOLD) */
      presets: [P("PD BRASS", [0, 0, 30, 90, 0, 0, 0, 0], [8, 70, 90, 40], 0, 6), P("PD ORGAN", [3, 0, 40, 0, 0, 0, 0, 0], [0, 127, 127, 30], 0, 6),
        P("PD STRINGS", [0, 4, 50, 40, 12, 0, 0, 0], [40, 90, 100, 70], 0, 5), P("RESO", [5, 0, 60, 60, 0, 0, 0, 0], [0, 70, 30, 60], 0, 1),
        P("PD BELL", [6, 0, 80, 50, 0, 0, 0, 0], [0, 95, 0, 90], 0, 7), P("WIRE", [4, 7, 70, 40, 7, 0, 0, 0], [10, 80, 80, 60], 0, 4),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("NEUTRINO", [3, 0, 20, 70, 0, 0, 0, 0], [0, 80, 0, 75]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("PD BASS", [0, 0, 50, 80, 4, 0, 60, 0], [0, 60, 60, 25], 1),
        P("SOFT KEYS", [3, 0, 30, 60, 6, 0, 0, 0], [0, 85, 30, 60])] },
    { name: "LOFI", titles: ["CHIP", "MOTION"], edit: [E("CHIP", ["4BIT", "4B/2", "8BIT", "1BIT", "STEP"], 0), E("WAVE", ["PLS", "TRI", "SAW", "NOIS", "WRAM"], 0), D("DUTY", F.INT, 0, 127, 64),
        D("CRUSH", F.PCT, 0, 127, 0), D("SWEEP", F.PCT, 0, 127, 0), D("VIBRATO", F.PCT, 0, 127, 0), E("ARP", ["OFF", "OCT", "MAJ", "MIN"], 0), D("TONE", F.PCT, 0, 127, 127)],
      presets: [P("PULSE LD", [0, 0, 32, 0, 0, 20, 0, 127], [0, 60, 90, 30], 1, 4), P("WAVE BASS", [1, 1, 0, 0, 0, 0, 0, 90], [0, 50, 70, 20], 1, 2),
        P("ARP 8BIT", [2, 0, 96, 0, 0, 0, 2, 110], [0, 60, 80, 40], 0, 13), P("WAVE LEAD", [0, 4, 92, 0, 0, 18, 0, 110], [0, 70, 90, 30], 1, 3),
        P("STEP LEAD", [4, 0, 40, 34, 0, 16, 0, 127], [0, 64, 127, 55], 1, 4),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("PHOTON", [2, 1, 64, 0, 16, 0, 0, 120], [0, 70, 0, 40]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("TRI BASS", [0, 1, 64, 0, 0, 0, 0, 100], [0, 60, 90, 20], 1),
        P("CHIP BELL", [2, 0, 20, 0, 30, 0, 0, 110], [0, 70, 0, 50])] },
    { name: "SAMPLE", titles: ["SET", "TONE"], edit: [E("SET", ["PIANO", "PIANO", "FLUTE", "SAX", "PIANO", "USR1", "USR2", "USR3"], 0), D("PITCH", F.SEMI, -24, 24, 0), D("BITS", F.INT, 0, 127, 0),
        E("LOOP", NONOFF, 1), D("CUTOFF", F.INT, 0, 127, 127), NONE, D("DRIVE", F.PCT, 0, 127, 0), NONE],
      presets: [P("PIANO", [0, 0, 0, 1, 127, 0, 0, 0], [0, 127, 127, 70]), P("PIANO", [0, 0, 0, 1, 127, 0, 0, 0], [0, 127, 127, 70]),
        P("FLUTE", [2, 0, 0, 1, 127, 0, 0, 0], [12, 80, 120, 60]), P("SAX", [3, 0, 0, 1, 127, 0, 0, 0], [12, 80, 120, 60]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("PIANO", [0, 0, 0, 1, 127, 0, 0, 0], [0, 127, 127, 70]),
        P("LOFI PIANO", [0, 0, 110, 1, 30, 0, 30, 0], [0, 127, 127, 70], 0, 0, [[95, 3], [9, 40], [13, 8]]),
        P("MUSIC BOX", [0, 24, 0, 0, 110, 0, 0, 0], [0, 90, 0, 80]),
        P("FLUTE PAD", [2, 0, 0, 1, 90, 0, 0, 0], [80, 90, 120, 100]),
        P("DARK SAX", [3, -12, 0, 1, 26, 0, 48, 0], [22, 80, 120, 55], 1, 0, [[13, 8], [9, 84], [12, 100]]),
        P("KOTO", [0, 12, 0, 0, 120, 0, 22, 0], [0, 72, 0, 50], 0, 0, [[6, 2]])] },
    { name: "VOICE", titles: ["VOWEL", "TONE"], edit: [D("VOWEL", F.INT, 0, 127, 0), D("VOWEL2", F.INT, 0, 127, 64), D("TALK", F.TIME, 0, 127, 0),
        D("PITCH", F.SEMI, -12, 12, 0), D("BUZZ", F.PCT, 0, 127, 64), D("BREATH", F.PCT, 0, 127, 10), D("Q", F.PCT, 0, 127, 64), D("RANDOM", F.PCT, 0, 127, 0)],
      presets: [P("CHOIR AAH", [0, 0, 0, 0, 40, 22, 60, 0], [85, 90, 115, 95], 0, 5), P("VOX LEAD", [32, 0, 0, 2, 90, 8, 72, 0], [6, 70, 105, 55], 1, 4),
        P("WOW BASS", [95, 0, 68, 0, 100, 0, 80, 0], [0, 70, 70, 30], 1, 8), P("WHISPER", [0, 95, 88, 3, 50, 120, 50, 0], [50, 90, 110, 90], 0, 5),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("CRYPT CHOIR", [112, 0, 0, -3, 34, 30, 64, 14], [90, 90, 118, 100], 0, 0, [[9, 70], [13, 8]]),
        P("MONK CHANT", [95, 0, 96, -5, 80, 12, 80, 0], [50, 80, 115, 85], 1, 0, [[9, 82], [12, 96], [13, 8]]),
        P("DREAM CHOIR", [0, 20, 0, 3, 55, 45, 55, 8], [80, 90, 118, 95]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("ROBOT TALK", [20, 100, 40, -12, 110, 4, 90, 30], [0, 70, 100, 30], 1)] },
    { name: "TRIO", titles: ["OSC", "TONE"], edit: [E("WAVE", ["SAW3", "PLS3", "PPT", "SST", "TRI3", "S&T", "P&S", "P+N", "NOIS", "SYNC", "SYNCP", "SYNC3",
        "RING", "RING3", "R+S", "R+SP"], 0), D("PITCH2", F.SEMI, -24, 24, 0), D("PITCH3", F.SEMI, -24, 24, -12), D("DETUNE", F.INT, 0, 50, 6, null, "ct"),
        E("MODE", ["LP", "BP", "HP", "NOT"], 0), D("CUTOFF", F.CUTOFF, 0, 127, 80), D("RES", F.PCT, 0, 127, 40), D("PW", F.PCT, 0, 127, 64)],
      presets: [P("FAT BASS", [0, 0, -12, 9, 0, 62, 45, 64], [0, 62, 60, 25], 1, 2), P("ARP LEAD", [2, 12, 0, 4, 0, 88, 25, 32], [0, 60, 90, 30], 0, 13),
        P("SYNC LEAD", [9, 9, 0, 0, 0, 82, 30, 64], [2, 70, 100, 40], 1, 4), P("RING BELL", [13, 0, 18, 6, 1, 96, 30, 64], [0, 92, 0, 80], 0, 7),
        P("CHIP CHOIR", [1, 0, 12, 7, 1, 62, 95, 40], [70, 90, 110, 85], 0, 5),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("TURBO SYNC", [9, 7, 0, 3, 0, 92, 28, 64], [2, 72, 105, 45], 1, 0, [[38, 24], [9, 86], [12, 90], [13, 8]]),
        P("NEON ARP", [1, 12, 0, 5, 0, 70, 35, 40], [0, 66, 0, 45]),
        P("COLLIDER", [13, 0, 23, 9, 2, 60, 50, 64], [0, 70, 0, 55], 0, 0, [[6, 36]]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("DIRTY BASS", [1, -12, 0, 8, 1, 62, 85, 30], [0, 50, 50, 20], 1, 0, [[95, 1], [96, -10]])] },
    { name: "WHEEL", titles: ["BARS", "TONE"], edit: [E("REG", ["FLUTE", "MELLOW", "HOLLOW", "SMOOTH", "3BAR", "BLUES", "GOSPEL", "ROCK",
        "TOPS", "CLARI", "REED", "STRNG", "CHAPL", "BRITE", "BASS", "FULL"], 4), D("SUB", F.INT, -8, 8, 0), D("BODY", F.INT, -8, 8, 0), D("TOP", F.INT, -8, 8, 0),
        E("PERC", ["OFF", "2ND", "3RD", "2SOFT", "3SOFT", "2SLOW", "3SLOW"], 0), D("CLICK", F.PCT, 0, 127, 40), D("DRIVE", F.PCT, 0, 127, 0), E("ROTOR", ["OFF", "SLOW", "FAST"], 1)],
      presets: [P("FULL ORGAN", [15, 0, 0, 0, 0, 30, 20, 1], [0, 64, 127, 45], 0, 5), P("JAZZ PERC", [4, 0, 0, 0, 2, 50, 8, 1], [0, 64, 127, 40], 0, 3),
        P("GOSPEL", [6, 0, 0, 0, 1, 60, 40, 2], [0, 64, 127, 45], 0, 6), P("SOFT FLUTE", [1, 0, -2, 0, 0, 10, 0, 1], [0, 64, 127, 55], 0, 5),
        P("ROCK DRIVE", [7, 0, 0, 0, 0, 70, 100, 2], [0, 64, 127, 40], 0, 4),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("CATHEDRAL", [12, 2, 0, 0, 0, 6, 0, 0], [48, 64, 127, 72]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("PEDAL BASS", [14, 4, 0, -4, 0, 20, 10, 0], [0, 64, 127, 30], 1),
        P("CLARINET", [9, 0, 2, -5, 0, 0, 14, 1], [24, 64, 120, 45], 1, 0, [[13, 8], [9, 89], [12, 70]])] },
    { name: "GRAIN", titles: ["GRAIN", "SPRAY"], edit: [E("SOURCE", ["PIANO", "PIANO", "FLUTE", "SAX", "PIANO", "USR1", "USR2", "USR3"], 0),
        D("POS", F.PCT, 0, 127, 32), D("SIZE", F.PCT, 0, 127, 80), D("DENSITY", F.PCT, 0, 127, 80),
        D("PITCH", F.SEMI, -24, 24, 0), D("SPREAD", F.PCT, 0, 127, 30), D("RANDOM", F.PCT, 0, 127, 10), D("TONE", F.PCT, 0, 127, 127)],
      presets: [P("CLOUD PAD", [2, 50, 92, 88, 0, 40, 14, 100], [70, 90, 120, 90], 0, 5), P("GLITCH", [3, 64, 24, 112, 0, 100, 90, 127], [0, 70, 100, 30], 0, 4),
        P("FROZEN", [0, 40, 108, 72, 0, 0, 10, 92], [50, 100, 127, 100], 0, 5), P("SHIMMER", [0, 30, 70, 100, 12, 30, 24, 110], [30, 90, 110, 90], 0, 7),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("QUARK CLOUD", [2, 70, 6, 124, 12, 120, 70, 115], [50, 90, 120, 95]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("PIANO HAZE", [0, 20, 100, 80, 0, 50, 20, 90], [70, 90, 120, 100]),
        P("SAX DRONE", [3, 60, 120, 90, -12, 20, 10, 80], [90, 90, 127, 100]),
        P("SCATTER", [2, 64, 40, 70, 12, 50, 0, 110], [0, 70, 100, 50])] },
    { name: "PHYS", titles: ["BODY", "EXCITE"], edit: [E("MODEL", ["MODAL", "STRNG", "MEMB", "SYMP"], 0), D("STRUCT", F.PCT, 0, 127, 64),
        D("BRIGHT", F.PCT, 0, 127, 80), D("DAMP", F.PCT, 0, 127, 80), D("POS", F.PCT, 0, 127, 20), D("ACCENT", F.PCT, 0, 127, 90),
        D("BOW", F.PCT, 0, 127, 0), D("EXCITE", F.PCT, 0, 127, 0)],
      presets: [P("BELL TREE", [0, 70, 100, 106, 12, 100, 0, 6], [0, 100, 127, 96], 0, 7), P("MARIMBA", [0, 116, 38, 40, 24, 90, 0, 30], [0, 90, 127, 52], 0, 6),
        P("PLUCK", [1, 56, 72, 84, 40, 96, 0, 0], [0, 100, 127, 58], 0, 3), P("BOWED METAL", [0, 98, 70, 112, 10, 80, 90, 0], [60, 90, 127, 90], 0, 5),
        P("KALIMBA", [0, 34, 16, 56, 100, 90, 0, 48], [0, 100, 127, 60], 0, 7), P("HAND DRUM", [2, 112, 76, 56, 44, 100, 14, 24], [0, 100, 127, 64], 0, 6),
        P("TOMS", [2, 0, 52, 40, 30, 100, 40, 30], [0, 100, 127, 70], 0, 2), P("DRONE STRING", [3, 127, 80, 88, 64, 100, 92, 0], [0, 100, 127, 90], 0, 3),
        P("HARP", [3, 8, 62, 74, 60, 90, 0, 0], [0, 100, 127, 80], 0, 3),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("HARPSICHORD", [1, 44, 112, 76, 10, 127, 0, 24], [0, 100, 127, 50]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("UPRIGHT", [1, 60, 60, 90, 20, 127, 0, 60], [0, 100, 127, 40], 1)] },
    { name: "DRUM", titles: ["KIT", "HIT"], edit: [E("KIT", ["STD", "66", "10", "77", "80", "10", "66", "55", "77", "DEEP", "TIGHT", "PERC",
        "USR1", "USR2", "USR3"], 0), D("PITCH", F.ST16, 0, 127, 64),   /* ((2.0, #35) USR1..3: a user sample slot as the kit) */
        D("TONE", F.PCT, 0, 127, 64), D("DECAY", F.PCT, 0, 127, 64), D("SNAP", F.PCT, 0, 127, 64), D("ACCENT", F.PCT, 0, 127, 100),
        E("KICK", ["PUNCH", "ROUND"], 0), D("DRIVE", F.PCT, 0, 127, 0)],
      presets: [P("DRUM KIT", [0, 64, 70, 64, 64, 100, 0, 0], [0, 100, 127, 100], 0, 12),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("WAR DRUMS", [0, 40, 38, 108, 40, 110, 1, 24], [0, 100, 127, 100]),
        P("NEON KIT", [4, 60, 80, 56, 90, 100, 0, 20], [0, 100, 127, 100]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("BOOM KIT", [4, 58, 60, 100, 50, 100, 0, 10], [0, 100, 127, 100]),
        P("CRISP KIT", [5, 64, 76, 60, 80, 100, 0, 0], [0, 100, 127, 100]),
        P("RHYTHM BOX", [6, 66, 64, 56, 64, 100, 0, 0], [0, 100, 127, 100]),
        P("ELECTRO KIT", [7, 64, 70, 60, 70, 100, 0, 15], [0, 100, 127, 100]),
        P("STUDIO KIT", [8, 64, 64, 64, 64, 100, 0, 0], [0, 100, 127, 100]),
        P("TIGHT KIT", [0, 70, 80, 30, 100, 110, 0, 10], [0, 100, 127, 100]),
        P("LOFI KIT", [0, 56, 30, 70, 40, 100, 1, 50], [0, 100, 127, 100]),
        /* (1.3, from Felucca) its kits DEEP, TIGHT, PERC */
        P("DEEP DRUMS", [9, 64, 64, 64, 64, 100, 0, 0], [0, 100, 127, 100]),
        P("SNAP KIT", [10, 64, 64, 56, 64, 100, 0, 16], [0, 100, 127, 100]),
        P("PERC KIT", [11, 64, 64, 64, 64, 100, 0, 0], [0, 100, 127, 100])] },
    { name: "NOISE", titles: ["SOURCE", "MOVE"], edit: [E("MODE", ["ANLG", "DUST", "LFSR", "META"], 0), D("COLOR", F.PCT, 0, 127, 64),
        D("CUTOFF", F.CUTOFF, 0, 127, 80), D("RES", F.PCT, 0, 127, 30), D("KEYTRK", F.PCT, 0, 127, 64), D("DENSITY", F.PCT, 0, 127, 0),
        D("DRIFT", F.PCT, 0, 127, 0), D("CRUSH", F.PCT, 0, 127, 0)],
      presets: [P("WIND", [0, 64, 70, 100, 127, 0, 70, 0], [90, 90, 110, 90], 0, 5), P("RAIN", [1, 30, 88, 80, 64, 105, 40, 0], [50, 90, 127, 70], 0, 5),
        P("ARCADE", [2, 0, 127, 0, 127, 112, 0, 84], [0, 80, 0, 50], 0, 3), P("METAL", [3, 0, 100, 40, 100, 32, 0, 0], [0, 75, 40, 60], 0, 7),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("CAVE WIND", [0, 100, 70, 112, 127, 0, 100, 0], [100, 90, 120, 100]),
        P("GEIGER", [1, 10, 100, 40, 64, 34, 0, 0], [0, 90, 127, 40]),
        P("PLASMA", [3, 0, 90, 90, 100, 40, 80, 0], [60, 90, 110, 90], 0, 0, [[9, 56], [14, 18]]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("OCEAN", [0, 50, 60, 20, 0, 0, 40, 0], [100, 90, 120, 110], 0, 0, [[9, 20], [14, 40], [10, 1]])] },
    { name: "FM6", titles: ["OPS", "PATCH"], edit: [D("ALGO", F.INT, 0, 32, 0), D("FEEDBACK", F.INT, -7, 7, 0), D("MOD LVL", F.BIPCT, -64, 63, 0),
        D("RATIO", F.INT, -16, 16, 0), D("MOD ENV", F.BIPCT, -64, 63, 0), D("VEL MOD", F.INT, -7, 7, 0), D("DETUNE", F.PCT, 0, 127, 0),
        D("PATCH", F.INT, 0, FM6.FACTORY_PK.length, 0)],   /* F1..F8, then OWN (eng_fm6.c, 1.0.3) */
      presets: [P("TINE EP", [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 127, 0], 0, 6), P("GLASS BELL", [0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 127, 0], 0, 7),
        P("FM BASS", [0, 0, 0, 0, 0, 0, 0, 2], [0, 0, 127, 0], 1, 2), P("FM BRASS", [0, 0, 0, 0, 0, 0, 0, 3], [0, 0, 127, 0], 0, 4),
        P("PAD", [0, 0, 0, 0, 0, 0, 30, 4], [0, 0, 127, 0], 0, 5), P("FM MARIMBA", [0, 0, 0, 0, 0, 0, 0, 5], [0, 0, 127, 0], 0, 3),
        P("FM ORGAN", [0, 0, 0, 0, 0, 0, 0, 6], [0, 0, 127, 0], 0, 6), P("NYLON PICK", [0, 0, 0, 0, 0, 0, 0, 7], [0, 0, 127, 0], 0, 13),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("GRAVE BELL", [0, 0, 6, 0, 20, 0, 30, 1], [0, 0, 127, 0]),
        P("GLASS KEYS", [0, 0, 8, 0, 0, 0, 24, 0], [0, 0, 127, 0]),
        P("ISOTOPE", [0, 0, 14, 2, -10, 0, 50, 1], [0, 0, 127, 0]),
        P("DARK MATTER", [0, 4, 16, 0, 10, 0, 0, 2], [0, 0, 127, 0], 1),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("PICK BASS", [0, 2, 12, 0, 16, 2, 0, 7], [0, 0, 127, 0], 1),
        P("GROWL BASS", [0, 5, 8, 0, 20, 0, 8, 3], [0, 0, 127, 0], 1, 0, [[14, 36], [9, 80], [95, 2]])] },
    { name: "SLICE", titles: ["SLICE", "PLAYBACK"], edit: [E("SOURCE", ["BREAK", "USR1", "USR2", "USR3", "PIANO", "FUNK"], 0),
        E("DIV", ["4", "8", "16", "32", "AUTO", "MAN"], 2), D("START", F.INT, 0, 31, 0), D("PITCH", F.SEMI, -24, 24, 0),
        E("MODE", ["ONE", "GATE", "LOOP"], 0), E("RVRS", ["OFF", "ON"], 0), D("DECAY", F.TIME, 0, 127, 127), D("CUTOFF", F.INT, 0, 127, 127)],
      presets: [P("CHOP", [0, 2, 0, 0, 0, 0, 127, 127], [0, 127, 127, 30], 0, 9), P("STUTTER", [0, 1, 0, 0, 1, 0, 90, 110], [0, 127, 127, 12], 0, 10),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("LOW BREAK", [0, 2, 0, -7, 0, 0, 127, 100], [0, 127, 127, 30]),
        P("BACK BREAK", [0, 2, 0, 0, 0, 1, 127, 127], [0, 127, 127, 30]),
        P("BREAK HITS", [0, 4, 0, 0, 0, 0, 127, 127], [0, 127, 127, 30]),
        P("SHORT CHOP", [0, 2, 0, 0, 0, 0, 80, 127], [0, 127, 127, 20]),
        P("FAST BREAK", [0, 2, 0, 5, 0, 0, 110, 127], [0, 127, 127, 25], 0, 0, [[95, 1]]),
        P("ROLL LOOP", [0, 3, 0, 0, 2, 0, 127, 127], [0, 127, 127, 20]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("FUNK BREAK", [5, 1, 0, 0, 0, 0, 127, 127], [0, 127, 127, 30])] },
    { name: "DRUM-X", titles: ["KIT", "HIT"], edit: [D("MORPH", F.PCT, 0, 127, 64), D("PITCH", F.ST16, 0, 127, 64),   /* (Skiff: JIANT FM's) */
        D("COLOR", F.PCT, 0, 127, 64), D("DECAY", F.PCT, 0, 127, 64), D("NOISE", F.PCT, 0, 127, 64), D("FM", F.PCT, 0, 127, 0),
        D("FOLD", F.PCT, 0, 127, 0), D("DRIVE", F.PCT, 0, 127, 0)],
      presets: [P("OWN KIT", [64, 64, 70, 64, 64, 0, 0, 0], [0, 100, 127, 100], 0, 12),
        /* (Skiff) the themes' sounds (src/eng_*.c) */
        P("HADRON KIT", [100, 72, 90, 40, 80, 70, 60, 25], [0, 100, 127, 100]),
        /* (Skiff phase 9) more for every engine (src/eng_*.c) */
        P("FACTORY KIT", [64, 64, 70, 64, 64, 0, 0, 0], [0, 100, 127, 100]),
        P("DEEP KIT", [64, 60, 64, 62, 60, 0, 0, 10], [0, 100, 127, 100]),
        P("CLICK KIT", [64, 64, 70, 64, 64, 0, 0, 0], [0, 100, 127, 100]),
        P("INDUSTRIAL", [64, 62, 70, 64, 70, 20, 30, 40], [0, 100, 127, 100]),
        P("SOFT KIT", [64, 64, 56, 60, 56, 0, 0, 0], [0, 100, 127, 100]),
        P("GLITCH KIT", [64, 64, 70, 60, 64, 30, 20, 0], [0, 100, 127, 100]),
        P("TRIBAL KIT", [64, 64, 64, 64, 60, 0, 0, 0], [0, 100, 127, 100]),
        P("LASER KIT", [64, 64, 70, 64, 64, 10, 0, 10], [0, 100, 127, 100])] },
  ];
  const FM6_E = ENG.findIndex((e) => e.name === "FM6"), FM6_OWN = FM6.FACTORY_PK.length, DRUM_E = ENG.findIndex((e) => e.name === "DRUM");
  /* factory PATTERNS[] (engines.c; the device loads them from SEQ > PATTERNS, presets only suggest one): absolute
     notes, 0 rest; flags 1 accent, 2 slide, 4 tie (holds the previous note) */
  const T_ = 4;
  const PATTERNS = [
    [[45, 45, 57, 45, 0, 48, 45, 55, 45, 0, 57, 52, 45, 48, 0, 50], [1, 0, 2, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0, 2, 0, 1]],
    [[0, 36, 0, 36, 0, 36, 0, 48, 0, 36, 0, 36, 0, 39, 0, 43], [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]],
    [[60, 0, 67, 0, 72, 67, 0, 64, 62, 0, 69, 0, 74, 69, 0, 67], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
    [[72, 0, 0, 74, 0, 0, 76, 0, 79, 0, 76, 0, 74, 0, 0, 0], [1, T_, 0, 2, T_, 0, 0, 0, 1, 0, 2, 0, 0, T_, T_, 0]],
    [[60, 0, 0, 0, 0, 0, 0, 0, 57, 0, 0, 0, 55, 0, 0, 0], [0, T_, T_, T_, T_, T_, T_, 0, 0, T_, T_, 0, 0, T_, T_, 0]],
    [[0, 0, 60, 0, 0, 63, 0, 0, 0, 0, 60, 0, 0, 65, 0, 63], [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
    [[72, 0, 0, 79, 0, 0, 84, 0, 0, 0, 76, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [[36, 0, 0, 0, 0, 0, 0, 36, 0, 0, 34, 0, 0, 0, 0, 0], [1, T_, T_, T_, 0, 0, 0, 0, 0, 0, 0, T_, T_, T_, 0, 0]],
    [[60, 61, 62, 67, 64, 65, 60, 69, 68, 70, 62, 67, 72, 72, 74, 64], [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
    [[60, 60, 61, 61, 62, 0, 63, 63, 64, 65, 65, 0, 66, 66, 66, 67], [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
    [[60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
    [[36, 42, 42, 42, 38, 42, 36, 42, 36, 42, 42, 36, 38, 42, 46, 42], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],   /* 12 BEAT (DRUM) */
    [[48, 51, 55, 60, 63, 67, 72, 75, 48, 51, 55, 60, 63, 67, 72, 75], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]],   /* 13 ARP */
  ];
  for (let op = 0; op < 4; op++) TP.push(D("ATK", F.TIME, 0, 127, 0), D("DEC", F.TIME, 0, 127, 0), D("SUS", F.PCT, 0, 127, 127), D("REL", F.TIME, 0, 127, 0), D("LVL", F.PCT, 0, 127, 127));
  TP.push(E("CHORD", ["OFF", "DIA3", "DIA7", "MAJ", "MIN", "DOM7", "MAJ7", "MIN7", "SUS4", "POW"], 0),   /* the chord keys 81, 82 */
    E("VOICING", ["CLOSE", "OPEN", "INV1", "INV2", "+OCT"], 0));
  for (const l of ["KICK", "SNARE", "CLAP", "CL HAT", "OP HAT", "TOM", "RIM", "BELL"]) TP.push(D(l, F.PCT, 0, 127, 127));   /* 83..90: DRUM lane levels */
  TP.push(E("DIR", ["FWD", "RVRS", "PING", "RAND"], 0));   /* 91: (Skiff) the play direction */
  TP.push(E("BY", ["OFF", "T1", "T2", "T3", "T4", "T5", "T6"], 0), D("DEPTH", F.PCT, 0, 127, 96), D("RELEASE", F.TIME, 0, 127, 73));   /* 92..94:
                                                     (Skiff) the ducking */
  TP.push(E("TYPE", ["SOFT", "HARD", "FOLD", "CRUSH", "FUZZ"], 0), D("TONE", F.BIPCT, -64, 63, 0));   /* 95, 96: (Skiff phase 9) DRIVE */
  TP.push(D("ATTACK", F.TIME, 0, 127, 0), D("DECAY", F.TIME, 0, 127, 60), D("SUSTAIN", F.PCT, 0, 127, 0),
    D("RELEASE", F.TIME, 0, 127, 40));               /* 97..100: (Skiff phase 9) ENV 2 */
  for (let k = 0; k < 8; k++) TP.push(D("TUNE", F.ST16, 0, 127, 64));   /* 101..108: (phase 9) the DRUM lanes' TUNE, */
  for (let k = 0; k < 8; k++) TP.push(D("DECAY", F.BIPCT, -64, 63, 0));   /* 109..116: .. DECAY (0: as designed) */
  TP.push(E("SYNC", ["OFF", "4BAR", "2BAR", "1/1", "1/2", "1/4", "1/8", "8T", "1/16", "16T", "1/32"], 0),   /* 117..119: (1.3) LFO 2 */
    E("TRIG", ["NOTE", "FREE"], 0), E("POLARITY", ["BI", "UNI"], 0));
  TP.push(D("SPREAD", F.PCT, 0, 127, 0));         /* 120: (1.3) SPREAD */
  TP.push(E("TYPE", ["OFF", "SOFT", "HARD", "FOLD", "FUZZ", "CRUSH", "PHASR", "FLANG", "CHOR"], 0),   /* 121..125: (1.3) the INSERT */
    D("A", F.PCT, 0, 127, 64), D("B", F.PCT, 0, 127, 96), D("C", F.PCT, 0, 127, 96), D("MIX", F.PCT, 0, 127, 127));
  TP.push(E("ENV SYNC", NONOFF, 0));              /* 126: (1.3) ENV SYNC ((2.0) on LFO 2: its whole name) */
  for (let k = 0; k < 8; k++) TP.push(D("PAN", F.BIPCT, -64, 63, 0));   /* 127..134: (2.0, #36) the DRUM lanes' PAN */
  TP.push(E("FOLLOW", ["OFF", "T1", "T2", "T3", "T4", "T5", "T6"], 0), E("MODE", ["KEY", "SCALE", "FIT"], 0),
    E("NOTE", ["ROOT", "LOW", "HIGH", "LAST"], 0));   /* 135..137: (2.1) the chord follow */
  const P_COUNT = 146, G_COUNT = 27, NSTEP = 64, P_E0 = 138, G_ENGSEL = 20, P_SLCR = 45;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const enumOrig = (d, v) => d.fmt === F.ENUM && d.names ? aliasOf(d.names, v - d.min) + d.min : v;   /* params.c enum_orig */
  /* six tracks (firmware v3; Skiff phase 6), a synth part each; engine / preset / p / step below are the selected track's */
  const NTRK = 6;
  const newTrack = () => ({ engine: 0, preset: 0, fm6: FM6.INIT_PK.slice(),
    p: TP.map((d) => d.def).concat(new Array(8).fill(0)),
    motion: {on: true, events: []},
    step: Array.from({ length: NSTEP }, () => ({ chance: 100, ratchet: 1, n: 0, notes: [0, 0, 0, 0], time: 2, flags: 0, vel: 0, hit: 0, acc: 0 })) });
  const st = {
    tracks: Array.from({ length: NTRK }, newTrack), sel: 0, rec: 0,
    g: GP.map((d) => d.def),
    slots: [null, null, null, null], songRows: [], chainPlaying: false, chainRow: 0, chainRemaining: 0,
    slotNames: ["", "", "", ""], projCur: -1, projName: "", projSig: "", playing: false,   /* ((Skiff W3) PROJ_NAME, TRANSPORT) */
    /* ((Skiff W3) the pool (each pattern's LEN, 0 empty: 01 02 T1's A B, 03 T4's A, 04 kept and unused), the lists
       ([pattern 1..64 or 0, REPS - 1]), the entry each track is on, its pattern + 1, the entry staged (127 none), SONG;
       the scenes ({cur, mutes}), the last one, LAUNCH, the mutes staged (bank.c) */
    pool: [16, 16, 16, 8].concat(new Array(60).fill(0)),
    lists: Array.from({ length: NTRK }, (_, k) => Array.from({ length: 16 }, (_, e) => [k === 0 && e < 2 ? e + 1 : k === 3 && !e ? 3 : 0, 0])),
    snds: Array.from({ length: NTRK }, () => Array.from({ length: 16 }, () => [0, 0])),   /* ((2.0, #30) the entries' sounds, as
                                                     LIST2 says them: 0 none; an engine + 1, its preset; 64 + a user slot) */
    cur: new Array(NTRK).fill(0), pid: [1, 0, 0, 3, 0, 0], staged: new Array(NTRK).fill(127), song: 0,
    scenes: new Array(16).fill(null), sceneLast: -1, launch: 0, muteArm: new Array(NTRK).fill(0),
    smp: [0, 1, 2].map(() => ({ flash: new Uint8Array(SMP.SLOT_SIZE).fill(0xFF), zones: 0, name: "", len: 0, next: SMP.DATA_OFF,
      mix: SMP.MIX0() })),                            /* ((#21) LEVEL x 16, REV x 16, DLY x 16) */
    bank: new Array(opt.slots || 32).fill(null),     /* user presets: {engine, name, p, pattern, grid, fm6 (FM6: its patch)} */
    uiCaps: opt.legacy || opt.v3 || opt.v5 ? 0 : opt.uiCaps ?? 25,   /* ((Skiff #27) 16: COLORS) */
    custom: { flags: 0, look: 0, c: new Array(11).fill(0), preview: null },   /* ((Skiff #27) THEME CUSTOM's set) */
    palette: 0, font: 0, monitor: 0, filter: 0, bankSig: 0,
    palettes: ["SKIFF", "HI-CON", "PAPER", "CRYPT", "NEON", "QUARK"],   // (Skiff, R1) THEME: the device's list (tools/gen_ui_palettes.py)
    favorites: Array.from({ length: ENG.length + 1 }, () => []),
    watch: false, v4: false, lastReq: 0,
  };
  for (const k of ["engine", "preset", "p", "step"]) {
    Object.defineProperty(st, k, { enumerable: false, get: () => st.tracks[st.sel][k], set: (v) => { st.tracks[st.sel][k] = v; } });
  }
  const watchMs = opt.watchMs || 3000;
  const desc = (scope, id) => (scope === 0 && id < P_COUNT ? (id >= P_E0 ? ENG[st.engine].edit[id - P_E0] : TP[id])
    : scope === 1 && id < G_COUNT ? GP[id] : null);
  const EMPTY = { n: 0, notes: [0, 0, 0, 0], time: 2, flags: 0, vel: 0, hit: 0, acc: 0, chance: 100, ratchet: 1 };
  const isDrum = () => ["DRUM", "DRUM-X"].includes(ENG[st.engine].name);   /* (Skiff: DRUM-X a drum track too) */
  const clearSteps = () => st.step.forEach((s) => Object.assign(s, EMPTY, { notes: [0, 0, 0, 0] }));
  function toGrid(s) {                            /* eng_drum.c step_to_grid: a lane's own note becomes its hit */
    if (s.time !== 0) return;
    const keep = s.notes.slice(0, s.n).filter((n) => { const l = drumLane(n); if (n !== LANE_NOTE[l]) return true; s.hit |= 1 << l; return false; });
    s.notes = [...keep, 0, 0, 0, 0].slice(0, 4); s.n = keep.length;
    if (!s.n && s.flags & 1) { s.acc |= s.hit; s.flags &= ~1; }
  }
  function loadPat16(pat) {                       /* ui.c load_pat16 (into a DRUM track: its grid) */
    const ps = stepsFromPattern(pat);
    st.step.forEach((s, i) => { Object.assign(s, EMPTY, i < 16 ? ps[i] : { notes: [0, 0, 0, 0] }); if (isDrum()) toGrid(s); });
    st.p[29] = 16;
  }
  const loadPattern = (k) => loadPat16(PATTERNS[k][0].map((n, i) => [n, PATTERNS[k][1][i]]));
  function applyPreset(pi) {
    const e = ENG[st.engine];
    if (e.name === "SAMPLE" && pi === PERC_SET) { setEngine(DRUM_E); return; }   /* once PERC: DRUM's kit (ui.c apply_preset_to) */
    pi = aliasOf(e.presets.map((x) => x.name), pi % e.presets.length);
    const pr = e.presets[pi];
    st.preset = pi;
    for (let i = 0; i < P_E0; i++) if (!trackOwn(i, P_E0)) st.p[i] = TP[i].def;   /* the rest of the sound to its defaults:
                                                     the matrix off; the SLICER, the chord keys, the steps and the other track
                                                     settings stay (ui.c apply_preset_to) */
    for (let i = 0; i < 8; i++) st.p[P_E0 + i] = pr.e[i];
    [1, 2, 3, 4].forEach((id, k) => { st.p[id] = pr.env[k]; });
    st.p[37] = pr.mono ? 2 : 0;
    st.p[33] = 0; st.p[34] = 24; st.p[35] = 28; st.p[36] = 36;
    for (const [id, v] of pr.more) st.p[id] = v;  /* (Skiff) its LFO, GLIDE, .. (core.h preset_t more) */
    if (e.name === "DRUM-X" && DRUMX_PKIT[pi])   /* ((Skiff phase 9) its kit, the project's: eng_drumx.c DRUMX_PKIT) */
      st.kit = DX_KITS[DRUMX_PKIT[pi] - 1].map(([mode, x, y]) => ({ mode, a: x.slice(), b: y.slice() }));
    if (st.engine === FM6_E) {                    /* eng_fm6.c fm6_track_loaded */
      const t = st.tracks[st.sel];
      t.own = null;
      if (st.p[P_E0 + 7] < FM6_OWN) { t.fm6 = FM6.FACTORY_PK[st.p[P_E0 + 7]].slice(); t.slot = st.p[P_E0 + 7]; } else fm6Adopt(t);
    }
  }
  /* SLOT s turned (eng_fm6.c fm6_poll): F1..F8 that factory patch (from OWN the own patch kept aside), OWN the own
     patch back */
  function fm6Slot(t, s) {
    if (s === t.slot) return;
    if (s >= FM6_OWN) { if (t.own) t.fm6 = t.own; t.own = null; t.slot = FM6_OWN; return; }
    if (t.slot === FM6_OWN && !t.own) t.own = t.fm6.slice();
    t.fm6 = FM6.FACTORY_PK[s].slice(); t.slot = s;
  }
  /* t's patch was put in as its own (eng_fm6.c fm6_adopt): SLOT = the factory patch it equals, else OWN */
  function fm6Adopt(t) {
    t.own = null;
    if (t.engine !== FM6_E) return;
    const k = FM6.FACTORY_PK.findIndex((pk) => pk.every((x, i) => x === t.fm6[i]));
    t.p[P_E0 + 7] = t.slot = k < 0 ? FM6_OWN : k;
  }
  function setEngine(ei) {
    if (ei % ENG.length === 1) { fm4Load(0); return; }   /* DIGITAL (retired): its first preset, as FM6 (ui.c set_engine_of) */
    st.engine = ei % ENG.length;
    for (let i = 0; i < 8; i++) st.p[P_E0 + i] = ENG[st.engine].edit[i].def;
    applyPreset(0);
  }
  /* the selected track's sound = p, DIGITAL's values, converted (ui.c fm4_apply) */
  function fm4Apply(p) {
    const r = FM4.convert(p, P_E0);
    st.engine = FM6_E; st.preset = r.preset; st.p = r.p;
    st.tracks[st.sel].fm6 = FM6.pack(r.voice);
    fm6Adopt(st.tracks[st.sel]);                  /* (the converted patch is the track's own: SLOT OWN) */
  }
  function fm4Load(k) {                           /* a DIGITAL preset number (ui.c fm4_load_preset) */
    const p = st.p.map((x, i) => (i < P_E0 && !trackOwn(i, P_E0) ? TP[i].def : x));
    fm4Apply(FM4.presetValues(p, k, P_E0));
  }
  const snapshot = (name) => {                   /* (upreset.c up_store: a DRUM track that strikes a lane: its grid; an FM6
                                                     track: its patch, up_fm6.c) */
    const grid = isDrum() ? gridFromSteps(st.step) : null;
    const fm6 = st.engine === FM6_E ? st.tracks[st.sel].fm6.slice() : null;
    return patternUsed(grid) ? { engine: st.engine, name, p: st.p.slice(), pattern: null, grid, fm6 }
      : { engine: st.engine, name, p: st.p.slice(), pattern: patternFromSteps(st.step), grid: null, fm6 };
  };
  const ratchetOn = () => !!syncCaps() && !opt.noRatchet;   /* (INFO 52 01 04, after the sync tag) */
  const stepxOn = () => ratchetOn() && !opt.noStepx;   /* (Skiff W1) a step's FLAM, COND, NUDGE (INFO 43 01) */
  const locksOn = () => ratchetOn() && !opt.noLocks;   /* (1.1, INFO 4C 01 01) MOTION ops 5..7 */
  const kitOn = () => stepxOn() && !opt.noKit;         /* (Skiff W3, INFO 4B 01 08) the DRUM-X kit */
  const projOn = () => kitOn() && !opt.noProj;         /* (Skiff W3, INFO 57 01 03) TRANSPORT, PROJ_NAME */
  const songOn = () => projOn() && !opt.noSong;        /* (Skiff W3, INFO 57 01 31) POOL, LIST, PERFORM */
  const tiesOn = () => songOn() && !opt.noTies;        /* ((2.0, #25) INFO 57 01 bit 6) a step's ties after its NUDGE */
  const song2On = () => songOn() && !opt.noSong2;      /* ((2.0) INFO 58 01: LIST2, NEW, COPY+, CHAIN, ONCE, the pool's 2 3) */
  const sndM = () => song2On() && !opt.noSnd;         /* ((2.0, #30) INFO 58 01 bit 1: LIST2's entry sounds, its op 9) */
  const stepOut = (x, b) => { b(x.n); x.notes.forEach(b); b(x.time); b(x.flags); b(x.vel); hitsEnc(x.hit, x.acc).forEach(b); if (!opt.legacy && !opt.v3 && !opt.v5) b(x.chance ?? 100); if (ratchetOn()) b(x.ratchet ?? 1);
    if (stepxOn()) { b(x.flam ? 1 : 0); b(x.cond | 0); b(((x.nudge | 0) + 32) & 63); } if (tiesOn()) b(x.ties | 0); };
  function stepIn(x, a) {                         /* editor.c ed_step_put: n, 4 notes, time, flags, vel [, hits (3) [, chance [, ratchet]]] */
    x.n = Math.min(4, a[0]); x.notes = a.slice(1, 5); x.time = Math.min(2, a[5]); x.flags = a[6] & 3; x.vel = a[7];
    if (a.length >= 11) { x.hit = a[8] | (a[10] & 1) << 7; x.acc = (a[9] | (a[10] & 2) << 6) & x.hit; }
    if (a.length >= 12) x.chance = Math.min(100, a[11]);
    if (a.length >= 13 && ratchetOn() && a[12] !== (x.ratchet ?? 1)) { x.ratchet = Math.max(1, Math.min(4, a[12])); x.flam = 0; }
    if (a.length >= 16 && stepxOn()) {             /* (Skiff W1) FLAM (x1 only), COND, NUDGE (as the firmware: kept otherwise) */
      x.flam = a[13] && (x.ratchet ?? 1) === 1 ? 1 : 0; x.cond = a[14] < TC_NAMES.length ? a[14] : 0; x.nudge = Math.min(63, a[15]) - 32;
    }
    if (tiesOn())                                  /* ((2.0) the ties, to its notes; none with hits, on a TIE or from an */
      x.ties = a.length >= 17 && !x.hit && x.time !== 1 ? a[16] & ((1 << x.n) - 1) : 0;   /* editor of before) */
  }
  /* a few user presets to start with, each with its preset's suggested pattern stored (as UP_STORE would) */
  [[0, 0, 0, "MY LEAD"], [1, FM6_E, 1, "GLASS BELL"], [2, 2, 3, "PHASE RESO"], [5, 3, 2, "8BIT ARP"]].forEach(([slot, e, p, name]) => {
    setEngine(e); applyPreset(p);
    if (ENG[e].presets[p].pat) loadPattern(ENG[e].presets[p].pat - 1);
    st.bank[slot] = snapshot(name);
    clearSteps(); st.p[29] = 16;
  });
  /* the power-on sounds (engines.c TRK_DEF): ACID, PAD, PULSE LD, DRUM KIT, (Skiff phase 6) PIANO, DRUM KIT */
  [[1, FM6_E, 4], [2, 3, 0], [3, 10, 0], [4, 4, 0], [5, 10, 0], [0, 0, 4]].forEach(([i, e, p]) => { st.sel = i; setEngine(e); applyPreset(p); });
  /* the device powers on with its sequencers empty; the mock starts as a little demo to look at: track 1 with
     the ACID pattern, track 4 with BEAT (as SEQ > PATTERNS would load them), pads left, lead right */
  st.sel = 3; loadPattern(11);
  st.sel = 0; loadPattern(0);
  st.tracks[1].p[39] = -24; st.tracks[2].p[39] = 20; st.tracks[2].p[0] = 92;
  const project = () => JSON.parse(JSON.stringify({ tracks: st.tracks, sel: st.sel, g: st.g, songRows: st.songRows }));
  st.slots[0] = project();
  /* ((Skiff W3) bank.c, as the mock needs it: the entry track k is on (127: on no entry's pattern), what uses pattern
     id, track k to entry e (at once stopped, staged playing; 1: empty), a MUTE to m (staged playing), STOP landing what
     is staged) */
  const bankCur = (k) => { const p = st.lists[k][st.cur[k]][0]; return p && p === st.pid[k] ? st.cur[k] : 127; };
  const refsOf = (id) => st.lists.reduce((n, l) => n + l.filter((x) => x[0] === id + 1).length, 0) +
    st.pid.filter((p, k) => p === id + 1 && bankCur(k) === 127).length;
  const entryGo = (k, e) => {                   /* ((#28) a REST too: the track on no pattern) */
    const p = st.lists[k][e][0];
    if (!p || (p !== PAT_REST && !st.pool[p - 1])) return 1;
    if (st.playing) st.staged[k] = e; else { st.cur[k] = e; st.pid[k] = p === PAT_REST ? 0 : p; st.staged[k] = 127; }
    return 0;
  };
  /* ((2.0) bank.c song_put's COPY+) entry e's pattern (its chain: all of it) into the first empty entries in a row after
     it, a copy of each (the first free number after its original's, pool_free_after), their REPS too; rc 1 no pattern
     there or no room after, 4 the pool full */
  const copyPlus = (k, e) => {
    const L = st.lists[k], on = (j) => L[j][0] !== 0, link = (j) => j < 15 && L[j][1] === 16 && on(j) && on(j + 1);
    let b0 = e, b1 = e, f, ids = [];
    if (!on(e) || L[e][0] === PAT_REST) return 1;
    while (b0 > 0 && link(b0 - 1)) b0--;
    while (link(b1)) b1++;
    for (f = b1 + 1; f + b1 - b0 < 16 && L.slice(f, f + b1 - b0 + 1).some((x) => x[0]); f++);
    if (f + b1 - b0 >= 16) return 1;
    for (let j = b0; j <= b1; j++) {
      const n = L[j][0] === PAT_REST ? PAT_REST - 1
        : st.pool.map((_, i) => (L[j][0] + i) % 64).find((i) => !st.pool[i] && !ids.includes(i + 1)) ?? -1;
      if (n < 0) return 4;
      ids.push(n + 1);
    }
    ids.forEach((id, i) => {
      if (id !== PAT_REST) st.pool[id - 1] = st.pool[L[b0 + i][0] - 1];
      L[f + i] = [id, L[b0 + i][1]];
      st.snds[k][f + i] = [...st.snds[k][b0 + i]];   /* ((#30) its sound too) */
    });
    return 0;
  };
  /* ((2.0, #30) bank.c song_snd_put) entry e of track k gets sound s (LIST2's two bytes; 0 0 none): rc 1 on an empty entry
     or for a sound it can't carry (no such engine or preset, a user slot not used, PHYS or GRAIN on a light track) */
  const sndPut = (k, e, s) => {
    const [s0, s1] = s, light = k >= 4 && ["GRAIN", "PHYS"].includes((ENG[s0 >= 64 ? (st.bank[s0 - 64] || {}).engine : s0 - 1] || {}).name);
    if (s0 && (!st.lists[k][e][0] || light || (s0 < 64 ? !ENG[s0 - 1] || ENG[s0 - 1].name === "-" || s1 >= ENG[s0 - 1].presets.length
      : s0 - 64 >= st.bank.length || !st.bank[s0 - 64]))) return 1;
    st.snds[k][e] = [s0, s0 >= 64 ? 0 : s1];          /* (a user sound's second byte: 0, as kept) */
    return 0;
  };
  const muteTo = (k, m) => {
    const tp = st.tracks[k].p;
    st.muteArm[k] = 0;
    if (!st.playing) tp[40] = m ? 1 : 0;
    else if (!!tp[40] !== !!m) st.muteArm[k] = m ? 2 : 1;
  };
  const landStaged = () => {
    st.staged.forEach((e, k) => {
      if (e !== 127) { const p = st.lists[k][e][0]; st.cur[k] = e; st.pid[k] = p === PAT_REST ? 0 : p; st.staged[k] = 127; }
    });
    st.muteArm.forEach((m, k) => { if (m) st.tracks[k].p[40] = m - 1; st.muteArm[k] = 0; });
  };

  function handle(cmd, a) {
    const out = [];
    const b = (x) => out.push(x & 0x7F), v = (x) => out.push(...v14enc(x)), s = (x) => out.push(...strEnc(x));
    const light = () => {                                /* (Skiff phase 6) INFO 54 01: T5, T6; no GRAIN, no PHYS there */
      const e = ENG.reduce((m, x, i) => m | (x.name === "GRAIN" || x.name === "PHYS" ? 1 << i : 0), 0);
      [0x54, 1, 0x30, e, e >> 7, e >> 14].forEach(b);
      if (stepxOn()) [0x43, 1, TC_NAMES.length].forEach(b);   /* (Skiff W1) */
      if (kitOn()) [0x4B, 1, 8].forEach(b);                    /* (Skiff W3) */
      if (projOn()) [0x57, 1, songOn() ? (tiesOn() ? 127 : 63) : 3].forEach(b);   /* ((#21) 32: SMP_MIX, with the song's; (2.0) 64 the ties) */
      if (projOn()) [0x49, 1, P_COUNT & 127, P_COUNT >> 7, P_E0 & 127, P_E0 >> 7].forEach(b);   /* ((Skiff 1.3) wide ids) */
      if (song2On()) [0x58, 1, sndM() ? 3 : 1].forEach(b);     /* ((2.0) LIST2, NEW, COPY+, CHAIN, ONCE, EMPTY, UNUSED;
                                                                   (#30) bit 1 the entries' sounds) */
    };
    const wid = (s, i) => (s === 2 ? [0, i + 128] : [s, i]);   /* ((1.3) scope 2: a track id from 128 on) */
    if (opt.legacy && cmd >= CMD.UP_LIST) return null;
    if (opt.v3 && cmd >= CMD.TRACK_PARAM) return null;
    if (opt.v5 && cmd >= CMD.SONG) return null;
    if (!st.uiCaps && cmd >= CMD.UI_STATE) return null;
    const uiState = () => {
      const sig = JSON.stringify(st.favorites).split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, st.filter);
      [st.uiCaps, palCur(), st.uiCaps & 2 ? st.font : 127, st.uiCaps & 4 ? st.monitor : 127, st.uiCaps & 8 ? st.filter : 127].forEach(b);
      for (const n of [sig, st.bankSig]) for (let i = 0; i < 4; i++) b(n >>> (i * 7));
    };
    const NB = st.bank.length;
    /* ((Skiff #27) THEME: CUSTOM last while a set is stored, in use: the look in st.palette, as menu_items.c) */
    const palNames = () => st.custom.flags & 1 ? [...st.palettes, "CUSTOM"] : st.palettes;
    const palCur = () => st.custom.flags & 2 ? st.palettes.length : st.palette;
    const palChoose = (x) => {
      if (x >= st.palettes.length) { st.custom.flags |= 2; st.palette = st.custom.look; } else { st.custom.flags &= ~2; st.palette = x; }
    };
    switch (cmd) {
      case CMD.UP_LIST: {
        if (a.length < 2) return null;
        const start = a[0], n = Math.max(0, Math.min(a[1], UP.LIST_MAX, NB - start));
        b(start); b(n); b(NB);
        for (let i = start; i < start + n; i++) { const u = st.bank[i]; b(u ? 1 : 0); b(u ? u.engine : 0); s(u ? u.name : ""); }
        break;
      }
      case CMD.UP_GET: {
        if (a.length < 1 || a[0] >= NB) return null;
        const u = st.bank[a[0]];
        b(a[0]); b(u ? 1 : 0); b(u ? u.engine : 0); s(u ? u.name : "");
        for (let i = 0; i < P_COUNT; i++) v(u ? u.p[i] : 0);
        if (u && u.grid) {                          /* kind 1: the grid's low 7 bits, then its bit 7s */
          for (let i = 0; i < UP.PAT; i++) { const x = hitsEnc(...u.grid[i]); b(x[0]); b(x[1]); }
          b(1);
          for (let i = 0; i < UP.PAT; i++) b(hitsEnc(...u.grid[i])[2]);
        } else {
          for (let i = 0; i < UP.PAT; i++) { const x = u ? u.pattern[i] : [0, 0]; b(x[0]); b(x[1]); }
          b(0);
        }
        break;
      }
      case CMD.UP_PUT: {
        if (a.length < 3) return null;
        const r = new Reader(a);
        let rc = 0;
        try {
          const slot = r.b(), engine = r.b(), name = r.s(), p = [], raw = [];
          let pattern = null, grid = null;
          for (let i = 0; i < P_COUNT; i++) p.push(r.v());
          for (let i = 0; i < UP.PAT; i++) raw.push([r.b(), r.b()]);
          const tail = a.length - r.i;
          if (tail !== 0 && (tail !== 1 + UP.PAT || a[r.i] > 1)) throw new Error("bad preset extension");
          if (tail && a[r.i] === 1) {              /* kind 1: a complete drum grid */
            r.b();
            grid = raw.map(([h, c]) => { const x = r.b(), hit = h | (x & 1) << 7; return [hit, (c | (x & 2) << 6) & hit]; });
          } else pattern = raw.map(([n, f]) => patNorm(n, f));
          if (slot >= NB || engine >= ENG.length || !name.length || name.length > UP.NAME_MAX || /[^\x20-\x7E]/.test(name)) rc = 1;
          else {
            const saved = st.engine;                /* values clamped to the ranges of that engine */
            const pc = fromPerc({ engine, p }, ENG.map((x) => x.name), P_E0);   /* SAMPLE PERC: DRUM (upreset.c up_migrate) */
            st.engine = pc ? pc.engine : engine;
            st.bank[slot] = { engine: st.engine, name, p: (pc ? pc.p : p).map((x, i) => { const d = desc(0, i); return clamp(x, d.min, d.max); }), pattern, grid };
            st.engine = saved;
          }
        } catch (e) { rc = 1; }
        b(a[0]); b(rc);
        break;
      }
      case CMD.UP_STORE: {
        if (a.length < 2) return null;
        const name = new Reader(a.slice(1)).s();
        const rc = a[0] >= NB || name.length > UP.NAME_MAX ? 1 : 0;
        if (!rc) st.bank[a[0]] = snapshot(name || `${ENG[st.engine].name} ${String(a[0] + 1).padStart(2, "0")}`);   /* (FM6: its patch) */
        b(a[0]); b(rc);
        break;
      }
      case CMD.UP_LOAD: {
        if (a.length < 1) return null;
        const u = st.bank[a[0]];
        if (u) {                                    /* the sound only (upreset.c up_load): the steps and the track's own */
          const own = st.p.slice();                 /* parameters (TRACK_OWN: mix, ARP, SCL, LEN.., SLICER) stay */
          const p = u.p.map((x, i) => (trackOwn(i, P_E0) ? own[i] : x));
          if (u.engine === 1) fm4Apply(p);          /* a DIGITAL record (kept as it is): FM6 */
          else { st.engine = u.engine; st.preset = 0; st.p = p; }
          if (u.engine === FM6_E) {                 /* its own patch (up_fm6.c upf_track_load); none: SLOT's factory / init */
            const t = st.tracks[st.sel], s = p[P_E0 + 7];
            t.fm6 = (u.fm6 || (s < FM6_OWN ? FM6.FACTORY_PK[s] : FM6.INIT_PK)).slice();
            fm6Adopt(t);
          }
        }
        b(a[0]); b(u ? 0 : 1);
        break;
      }
      case CMD.UP_ERASE:
        if (a.length < 1) return null;
        if (a[0] < NB) { st.bank[a[0]] = null; st.favorites[ENG.length][a[0]] = false; }
        b(a[0]); b(a[0] < NB ? 0 : 1);
        break;
      case CMD.WATCH:
        if (a.length < 1) return null;
        st.watch = !!(a[0] & 1);
        st.v4 = st.watch && !opt.v3 && !!(a[0] & 2);   /* v4: TRACK_CHANGED pushes too */
        b((st.watch ? 1 : 0) | (st.v4 ? 2 : 0));
        break;
      case CMD.PING:
        b(0);
        break;
      case CMD.UI_STATE: uiState(); break;
      case CMD.UI_PALETTES: b(palNames().length); palNames().forEach(s); break;
      case CMD.UI_SET: {
        const id = a[0], val = a[1], key = ["palette", "font", "monitor", "filter"][id];
        const rc = a.length !== 2 || !key ? 1 : !(st.uiCaps & 1 << id) ? 2 : val >= (id === 0 ? palNames().length : id === 2 ? 3 : 2) ? 1 : 0;
        if (!rc && !id) palChoose(val); else if (!rc) st[key] = val;
        b(rc || (opt.noFlash ? 3 : opt.deferSettings ? 4 : 0)); b(id ?? 127); b(val ?? 127); uiState(); break;
      }
      case CMD.FAV_GET: case CMD.FAV_SET: {
        if (!(st.uiCaps & 8)) { b(2); break; }
        const engine = a[0], preset = v14dec(a[1], a[2]), count = a[3];
        const limit = engine === ENG.length ? st.bank.length : engine < ENG.length ? ENG[engine].presets.length : 0;
        if (a.length !== 4 || preset < 0 || preset >= limit ||
            (cmd === CMD.FAV_GET ? !count || count > 32 || preset + count > limit : count > 1 || engine === ENG.length && count && !st.bank[preset])) { b(1); break; }
        if (cmd === CMD.FAV_SET) st.favorites[engine][preset] = !!count;
        b(cmd === CMD.FAV_SET ? (opt.noFlash ? 3 : opt.deferSettings ? 4 : 0) : 0); b(engine); v(preset); b(count);
        if (cmd === CMD.FAV_GET) for (let i = 0; i < count; i++) b(!!st.favorites[engine][preset + i]);
        break;
      }
      case CMD.MENU_DESC: case CMD.MENU_SET: {   /* (Skiff W3) editor_menu.c */
        if (opt.noMenu || !st.uiCaps || !syncCaps()) return null;
        st.menu = st.menu || Object.fromEntries(MENU.map((x) => [x.id, x.def]));
        const names = (x) => x.names || palNames();
        const val = (x) => x.id === 0 ? palCur() : st.menu[x.id];
        if (cmd === CMD.MENU_DESC) {
          const x = MENU[a[0]];
          b(a[0]);
          if (!x) { b(127); break; }
          b(x.id); b(0); v(val(x)); v(0); v(names(x).length - 1); s(x.name); names(x).forEach(s); b(x.tab); s(MENU_TABS[x.tab]);
        } else {
          const x = MENU.find((m) => m.id === a[0]);
          if (!x) { b(1); b(a[0]); v(0); break; }
          const w = Math.max(0, Math.min(names(x).length - 1, v14dec(a[1], a[2])));
          if (x.id === 0) palChoose(w); else st.menu[x.id] = w;
          b(0); b(x.id); v(w);
        }
        break;
      }
      case CMD.TRANSPORT: {                    /* (Skiff W3) editor_project.c (the mock's audio takes a request at once) */
        if (!projOn() || a.length > 1 || (a.length && (a[0] < 1 || a[0] > 4))) return null;
        if (a[0] === 4) { st.rec ^= 1 << st.sel; if (st.rec >> st.sel & 1) st.playing = true; }   /* (as its button) */
        else if (a[0] === 1 || a[0] === 3) st.playing = true;
        else if (a[0] === 2) { st.playing = false; landStaged(); }   /* (stopped: what is staged comes in) */
        [0, +st.playing, 0, 0, st.rec, st.sel].forEach(b);
        { const at = Math.floor((Date.now() - (st.t0 || (st.t0 = Date.now()))) / 125);   /* (Coracle 0.9.7) the playheads, at 120 BPM 16ths */
          for (let k = 0; k < 6; k++) b(st.playing ? at % 16 : 127); }
        break;
      }
      case CMD.PROJ_NAME: {                    /* (Skiff W3) editor_project.c: SAVE AS, RENAME (the transport stopped first) */
        if (!projOn()) return null;
        let rc = 0;
        if (a.length) {
          const nb = a.slice(2);
          if (nb.length && !nb[nb.length - 1]) nb.pop();
          if (a.length < 2 || (a[0] !== 1 && a[0] !== 2) || a[1] > 3 || nb.length > 12 || nb.some((c) => c < 32 || c > 126)) return null;
          const nm = String.fromCharCode(...nb).toUpperCase(), k = a[1];
          st.playing = false;
          if (a[0] === 1) { st.slots[k] = project(); st.slotNames[k] = nm; st.projCur = k; st.projName = nm; st.projSig = JSON.stringify(project()); }
          else if (!st.slots[k]) rc = 1;
          else { st.slotNames[k] = nm; if (st.projCur === k) st.projName = nm; }
        }
        b(a.length ? a[0] : 0); b(rc); b(st.projCur < 0 ? 127 : st.projCur); b(JSON.stringify(project()) !== st.projSig ? 1 : 0); s(st.projName);
        for (let k = 0; k < 4; k++) { b(st.slots[k] ? 1 : 0); s(st.slots[k] ? st.slotNames[k] : ""); }
        break;
      }
      case CMD.POOL: {                         /* (Skiff W3) editor_song.c; ((2.0) 2 EMPTY, 3 CLEAR UNUSED) */
        const good = !a.length || (song2On() && a.length === 1 && a[0] === 3) ||
          (a.length === 2 && (a[0] === 1 || (song2On() && a[0] === 2)) && a[1] <= 63);
        if (!songOn() || !good) return null;
        let rc = 0;
        if (a.length && a[0] === 3) {
          const un = st.pool.map((x, i) => (x && !refsOf(i) ? i : -1)).filter((i) => i >= 0);
          if (!un.length) rc = 1; else if (st.playing) rc = 3; else un.forEach((i) => { st.pool[i] = 0; });
        } else if (a.length) {
          const id = a[1];
          if (!st.pool[id]) rc = 1; else if (a[0] === 1 && refsOf(id)) rc = 2; else if (st.playing) rc = 3;
          else if (a[0] === 1) st.pool[id] = 0;        /* (EMPTY: its steps, which the mock doesn't keep; its LEN stays) */
        }
        b(a.length ? a[0] : 0); b(rc);
        for (let i = 0; i < 64; i++) { b(st.pool[i]); b(Math.min(127, refsOf(i))); }
        break;
      }
      case CMD.LIST: case CMD.LIST2: {         /* (Skiff W3) editor_song.c; ((2.0) LIST2: SONG 0..2, REPS bytes as kept) */
        const [op, k, e, v] = a, L = st.lists, two = cmd === CMD.LIST2, s2 = song2On();
        const good = !a.length || (op === 6 ? a.length === 2 && k <= (s2 ? 2 : 1) : a.length >= 3 && k < NTRK && e < 16 &&
          (op === 1 || op === 5 ? a.length === 4 && v >= (op === 5 && s2 ? 0 : 1) && v <= (op === 1 ? PAT_REST : 16)
            : op === 9 ? two && sndM() && a.length === 5   /* ((#30) SOUND: LIST2's) */
            : a.length === 3 && ((op >= 2 && op <= 4) || (s2 && (op === 7 || op === 8)))));
        if (!songOn() || (two && !s2) || !good) return null;
        let rc = 0;
        if (op === 1) { if (v !== PAT_REST && !st.pool[v - 1]) rc = 1; else { L[k][e][0] = v; if (st.cur[k] === e) rc = entryGo(k, e); } }
        else if (op === 2) {
          const id = L[k][e][0] - 1, n = st.pool.findIndex((x) => !x);
          if (id < 0 || id >= 64) rc = 1;               /* ((#28) a REST: nothing to copy) */
          else if (n < 0) rc = 4;
          else { st.pool[n] = st.pool[id]; L[k][e][0] = n + 1; if (st.cur[k] === e && st.pid[k] === id + 1) st.pid[k] = n + 1; }
        } else if (op === 3) rc = entryGo(k, e);
        else if (op === 4) {
          if (L[k][e][0] === PAT_REST) { L[k][e][0] = 0; st.snds[k][e] = [0, 0]; }   /* ((#28) a REST: at once, playing too; */
          else if (st.playing) rc = 3;                                                 /* (#30) its sound with it) */
          else {
            const id = L[k][e][0] - 1, on = st.cur[k] === e && st.pid[k] === id + 1;
            L[k][e] = [0, 0];
            st.snds[k][e] = [0, 0];
            if (on) st.pid[k] = 0;
            if (id >= 0 && !refsOf(id)) st.pool[id] = 0;
          }
        } else if (op === 9) rc = sndPut(k, e, a.slice(3));
        else if (op === 5) { if (!L[k][e][0] || (!v && e === 15)) rc = 1; else L[k][e][1] = v ? v - 1 : 16; }   /* ((2.0) 0: */
        else if (op === 6) st.song = k;                                                                       /* CHAIN) */
        else if (op === 7) {                           /* ((2.0) NEW: the first free number) */
          const n = st.pool.findIndex((x) => !x);
          if (n < 0) rc = 4; else { st.pool[n] = st.tracks[k].p[29] || 16; L[k][e][0] = n + 1; if (st.cur[k] === e) rc = entryGo(k, e); }
        } else if (op === 8) rc = copyPlus(k, e);
        b(a.length ? op : 0); b(rc); b(two ? st.song : st.song ? 1 : 0);
        for (let t = 0; t < NTRK; t++) {
          b(bankCur(t)); b(st.staged[t]); b(st.pid[t] ? st.pid[t] - 1 : 127);
          L[t].forEach(([p, r], j) => { b(p); b(two ? r : r & 15); if (two && sndM()) st.snds[t][j].forEach(b); });
        }
        break;
      }
      case CMD.COLORS: {                       /* (Skiff #27) editor_preferences.c ed_colors */
        if (!(st.uiCaps & 16)) return null;
        const cu = st.custom, save = opt.noFlash ? 3 : opt.deferSettings ? 4 : 0, o = a[0];
        let rc = 0;
        if (a.length === 1 && o === 2) { cu.flags = 0; rc = save; }
        else if (a.length === 1 && o === 3) cu.preview = null;
        else if (a.length) {
          const raw = unpack7(a.slice(2)), c = Array.from({ length: 11 }, (_, i) => raw[2 * i] | raw[2 * i + 1] << 8);
          if (a.length !== 28 || raw.length !== 22 || o > 1 || a[1] >= st.palettes.length) rc = 1;
          else if (!o) cu.preview = { look: a[1], c };
          else { Object.assign(cu, { c, look: a[1], flags: 3, preview: null }); st.palette = a[1]; rc = save; }
        }
        b(rc); b(cu.flags & 3); b(cu.flags & 1 ? cu.look : 0);
        pack7(cu.c.flatMap((x) => [x & 255, x >> 8])).forEach(b);
        break;
      }
      case CMD.PERFORM: {                      /* (Skiff W3) editor_song.c */
        const [op, v] = a;
        if (!songOn() || (a.length && !(op === 4 ? a.length === 1 : a.length === 2 &&
          ((op >= 1 && op <= 2 && v < 16) || (op === 3 && v < NTRK) || (op === 5 && v < 4))))) return null;
        let rc = 0;
        if (op === 1) { st.scenes[v] = { cur: st.lists.map((_, k) => bankCur(k)), mutes: st.tracks.map((x) => x.p[40] ? 1 : 0) }; st.sceneLast = v; }
        else if (op === 2) {
          const sc = st.scenes[v];
          if (!sc) rc = 1;
          else {
            sc.cur.forEach((e, k) => { if (e !== 127 && e !== bankCur(k)) entryGo(k, e); });
            sc.mutes.forEach((m, k) => muteTo(k, m));
            st.sceneLast = v;
          }
        } else if (op === 3) { if (st.muteArm[v]) st.muteArm[v] = 0; else muteTo(v, st.tracks[v].p[40] ? 0 : 1); }
        else if (op === 4) { st.staged.fill(127); st.muteArm.fill(0); }
        else if (op === 5) st.launch = v;
        const bits = st.scenes.reduce((m, x, i) => m | (x ? 1 << i : 0), 0);
        [a.length ? op : 0, rc, st.launch, st.sceneLast < 0 ? 127 : st.sceneLast, bits & 127, bits >> 7 & 127, bits >> 14 & 3].forEach(b);
        st.tracks.forEach((x, k) => { b(x.p[40] ? 1 : 0); b(st.muteArm[k]); });
        break;
      }
      case CMD.KIT_GET: case CMD.KIT_PUT: {   /* (Skiff W3) editor.c: a lane; KIT_PUT its 15 values in range (else no reply) */
        if (!kitOn() || a[0] > 7 || a.length !== (cmd === CMD.KIT_GET ? 1 : 16)) return null;
        if (cmd === CMD.KIT_PUT && (a[1] > 3 || a[2] > 2 || a[3] > 1 || a[4] > 3 || a[5] > 1)) return null;
        st.kit = st.kit || DX_KIT_DEF.map(([mode, x, y]) => ({ mode, a: x.slice(), b: y.slice() }));
        const L = st.kit[a[0]];
        if (cmd === CMD.KIT_PUT) { L.mode = a[1] | a[2] << 2 | a[3] << 4 | a[4] << 5 | (a[5] ? 0x80 : 0); L.a = a.slice(6, 11); L.b = a.slice(11, 16); }
        [a[0], L.mode & 3, L.mode >> 2 & 3, L.mode >> 4 & 1, L.mode >> 5 & 3, L.mode >> 7 & 1, ...L.a, ...L.b].forEach(b);
        break;
      }
      case CMD.MOTION: {
        const track = st.tracks[a[0]], m = track && track.motion;
        if (!m) return null;
        let rc = 0;
        if (a.length > 1 && st.chainPlaying) rc = 3;
        else if (a[1] === 1) m.on = !!a[2];
        else if (a[1] === 2) m.events = [];
        else if (a[1] === 6 && locksOn()) m.events = m.events.filter(e => !e.lock || (a[2] !== 127 && e.step !== a[2]));
        else if (a[1] === 3 || a[1] === 4 || (a[1] === 5 && locksOn())) {   /* (1.1: 5 a lock, as 3 an event) */
          const step = a[2] & 63, param = a[3] | (a[2] >> 6 & 1) << 7;   /* ((1.3) bit 6: the id's bit 7) */
          const at = m.events.findIndex(e => e.step === step && e.param === param);
          if (a[1] === 4) { if (at >= 0) m.events.splice(at, 1); }
          else if (at < 0 && st.tracks.reduce((n,t) => n + t.motion.events.length, 0) >= 64) rc = 2;
          else { const e = {step,param,value:v14dec(a[4],a[5]),lock:a[1] === 5}; if (at >= 0) m.events[at] = e; else m.events.push(e); }
        } else if (a.length > 1 && !(a[1] === 7 && locksOn())) rc = 1;
        [a[0],rc,+m.on,m.events.length,64].forEach(b);
        m.events.forEach(e => {b(e.step | (e.param >> 7) << 6);b(e.param & 127);v(e.value);});
        if (a.length > 1 && a[1] >= 5 && locksOn()) m.events.forEach(e => b(e.lock ? 1 : 0));   /* (the kinds) */
        break;
      }
      case CMD.INFO:
        s(opt.legacy ? "FELUCCA 0.4 BETA (MOCK)" : "SKIFF (MOCK)"); b(ENG.length); b(Math.min(P_COUNT, 127)); b(G_COUNT); b(NSTEP); b(Math.min(P_E0, 127));
        ENG.forEach((e) => s(e.name));
        if (!opt.legacy) b(NTRK);
        if (!opt.legacy && !opt.v3 && !opt.v5) {
          b(16);
          if (st.uiCaps) { b(0x55); b(1); b(st.uiCaps); b(0x4d); b(1); b(64); b(1); if (!opt.noFm6) { b(0x46); b(1); b(FM6.FACTORY_PK.length); b(0); }
            if (syncCaps()) { b(0x53); b(1); b(syncCaps()); if (!opt.noFm6) { b(0x50); b(1); b(3); } if (!opt.noMenu) { b(0x4E); b(1); b(MENU.length); } if (ratchetOn()) { b(0x52); b(1); b(4); if (locksOn()) { b(0x4C); b(1); b(1); } light(); } } }   /* (FM6 v2: no bank, preset patches) */
        }
        break;
      case CMD.GET: case CMD.SET: {
        if (a.length < 2) return null;
        const [sc, id] = wid(a[0], a[1]), d = desc(sc, id);
        if (!d) return null;
        const arr = sc ? st.g : st.p;
        if (cmd === CMD.SET && a.length >= 4) {
          if (sc === 1 && id === G_ENGSEL) setEngine(clamp(v14dec(a[2], a[3]), 0, ENG.length - 1));
          else if (d.max > d.min) arr[id] = enumOrig(d, clamp(v14dec(a[2], a[3]), d.min, d.max));
          if (!sc && id === P_E0 + 7 && st.engine === FM6_E) fm6Slot(st.tracks[st.sel], arr[id]);   /* PTCH (fm6_poll) */
        }
        b(a[0]); b(a[1]); v(arr[id]);
        break;
      }
      case CMD.DUMP:
        b(st.engine); b(st.preset); st.p.forEach(v); st.g.forEach(v);
        break;
      case CMD.TRACK:
        if (a.length >= 1 && a[0] < NTRK) st.sel = a[0];
        b(st.sel); b(NTRK);
        st.tracks.forEach((t, i) => { b(t.engine); b(t.preset); v(t.p[0]); b(t.p[40] ? 1 : 0); b((st.rec >> i) & 1); });
        break;
      case CMD.TRACK_MIX: {
        if (a.length < 1 || a[0] >= NTRK) return null;
        const t = st.tracks[a[0]];
        if (a.length >= 4) {
          t.p[0] = clamp(v14dec(a[1], a[2]), 0, 127);
          t.p[40] = a[3] ? 1 : 0;
        }
        b(a[0]); v(t.p[0]); b(t.p[40] ? 1 : 0);
        break;
      }
      case CMD.TRACK_DUMP: {
        if (a.length < 1 || a[0] >= NTRK) return null;
        const t = st.tracks[a[0]];
        b(a[0]); b(t.engine); b(t.preset); t.p.forEach(v);
        break;
      }
      case CMD.TRACK_PARAM: {
        const tr = a[0] & 63, id = a[1] | (a[0] >> 6 & 1) << 7;   /* ((1.3) bit 6: the id's bit 7) */
        if (a.length < 2 || tr >= NTRK || id >= P_COUNT) return null;
        const t = st.tracks[tr], d = id >= P_E0 ? ENG[t.engine].edit[id - P_E0] : TP[id];
        if (a.length >= 4 && d.max > d.min) t.p[id] = enumOrig(d, clamp(v14dec(a[2], a[3]), d.min, d.max));
        b(a[0]); b(a[1]); v(t.p[id]);
        break;
      }
      case CMD.TRACK_STEP: {
        if (a.length < 2 || a[0] >= NTRK || a[1] >= NSTEP) return null;
        const x = st.tracks[a[0]].step[a[1]];
        if (a.length >= 10) stepIn(x, a.slice(2));
        b(a[0]); b(a[1]); stepOut(x, b);
        break;
      }
      case CMD.DESC: {
        if (a.length < 2) return null;
        const d = desc(...wid(a[0], a[1]));
        if (!d) return null;
        b(a[0]); b(a[1]); b(d.fmt); v(d.min); v(d.max); v(d.def); s(d.label); s(d.unit || "");
        if (d.fmt === F.ENUM && d.names) for (let i = 0; i <= d.max - d.min && i < 24; i++) s(d.names[i]);
        break;
      }
      case CMD.STEP_GET: case CMD.STEP_SET: {
        if (a.length < 1 || a[0] >= NSTEP) return null;
        const x = st.step[a[0]];
        if (cmd === CMD.STEP_SET && a.length >= 9) stepIn(x, a.slice(1));
        b(a[0]); stepOut(x, b);
        break;
      }
      case CMD.FM6_GET: case CMD.FM6_PUT: case CMD.FM6_LIST: case CMD.FM6_ERASE: {   /* editor_fm6.c */
        if (opt.noFm6 || !st.uiCaps) return null;
        const nf = FM6.FACTORY_PK.length, fm6User = (k) => k < NB && st.bank[k] && st.bank[k].engine === FM6_E;
        if (cmd === CMD.FM6_LIST) {                 /* the factory patches; no bank (1.0.3) */
          if (a.length) return null;
          b(nf); b(0);
          for (let i = 0; i < nf; i++) { b(1); s(FM6.name(FM6.unpack(FM6.FACTORY_PK[i]))); }
        } else if (cmd === CMD.FM6_ERASE) {
          b(a[0] ?? 127); b(a.length !== 1 ? 1 : 3);   /* (3: no bank) */
        } else if (cmd === CMD.FM6_GET) {
          let rc = a.length !== 2 || a[0] > 3 ? 1 : 0, pk = null;
          if (!rc) {
            if (a[0] === 0 && a[1] < NTRK) pk = st.tracks[a[1]].fm6;
            else if (a[0] === 1) rc = 3;
            else if (a[0] === 2 && a[1] < nf) pk = FM6.FACTORY_PK[a[1]];
            else if (a[0] === 3 && a[1] < NB) { pk = fm6User(a[1]) ? st.bank[a[1]].fm6 : null; rc = pk ? 0 : 2; }
            else rc = 1;
          }
          b(a[0] ?? 127); b(a[1] ?? 127); b(rc);
          if (!rc) pk.forEach(b);
        } else {
          let rc = a.length !== 2 + 128 ? 1 : 0;
          const pk = rc ? null : FM6.pack(FM6.unpack(a.slice(2)));   /* (every value into its range) */
          if (!rc && a[0] === 0 && a[1] < NTRK) { st.tracks[a[1]].fm6 = pk; fm6Adopt(st.tracks[a[1]]); }
          else if (!rc && a[0] === 1) rc = 3;
          else if (!rc && a[0] === 3 && fm6User(a[1])) st.bank[a[1]].fm6 = pk;
          else rc = 1;
          b(a[0] ?? 127); b(a[1] ?? 127); b(rc);
        }
        break;
      }
      case CMD.PRESET:
        if (a.length < 2 || a[0] >= ENG.length) return null;
        if (a[0] === 1) fm4Load(a[1]);              /* a DIGITAL preset: its sound, as FM6 */
        else {
          if (a[0] !== st.engine) setEngine(a[0]);
          applyPreset(a[1]);
        }
        b(st.engine); b(st.preset);
        break;
      case CMD.SONG: {
        if (!a.length || a[0] > 3) return null;
        let rc = 0;
        if (a[0] === 1) {
          const rows = Array.from({ length: a[1] || 0 }, (_, i) => ({ slot: a[2 + 2 * i], repeat: a[3 + 2 * i] }));
          if (a.length < 2 || a[1] > 16 || a.length !== 2 + 2 * a[1] || rows.some((r) => r.slot > 3 || r.repeat < 1 || r.repeat > 16)) rc = 1;
          else if (st.chainPlaying) rc = 2;
          else st.songRows = rows;
        } else if (a[0] === 2) {
          if (st.chainPlaying) rc = 2;
          else if (!st.songRows.length) rc = 1;
          else {
            const missing = st.songRows.find((r) => !st.slots[r.slot]);
            if (missing) rc = 3 + missing.slot;
            else { st.chainPlaying = true; st.chainRow = 0; st.chainRemaining = st.songRows[0].repeat; }
          }
        } else if (a[0] === 3) st.chainPlaying = false;
        b(a[0]); b(rc); b(st.songRows.length); b(st.chainPlaying ? 1 : 0); b(st.chainRow); b(st.chainRemaining);
        st.songRows.forEach((r) => { b(r.slot); b(r.repeat); });
        break;
      }
      case CMD.PROJECT: {
        if (a.length < 2) return null;
        const k = a[1] & 3;
        if (a[0] > 2) return null;
        if (a[0] === 1) { st.chainPlaying = false; st.slots[k] = project(); }
        else if (a[0] === 0 && st.slots[k]) {
          st.chainPlaying = false; Object.assign(st, JSON.parse(JSON.stringify(st.slots[k])));
          /* SAMPLE PERC tracks: DRUM's kit (project.c proj_perc). Removed factory presets keep their saved sound; only
             the display index is normalized. */
          st.tracks.forEach((t) => {
            const pc = fromPerc({ engine: t.engine, p: t.p }, ENG.map((x) => x.name), P_E0);
            if (pc) { t.engine = pc.engine; t.p = pc.p; t.preset = 0; }
            if (t.preset >= ENG[t.engine].presets.length) t.preset = 0;
          });
        }
        if (a[0] === 1) st.slotNames[k] = st.projName;   /* ((Skiff W3) a save keeps the music's name; the music is the slot's) */
        if (a[0] === 1 || (a[0] === 0 && st.slots[k])) { st.projCur = k; st.projName = st.slotNames[k]; st.projSig = JSON.stringify(project()); }
        b(a[0]); b(k); b(st.slots[k] ? 1 : 0);
        break;
      }
      case CMD.NAMES:
        if (a.length < 1 || a[0] >= ENG.length) return null;
        b(a[0]); b(ENG[a[0]].presets.length); ENG[a[0]].presets.forEach((p) => s(p.name));
        ENG[a[0]].titles.forEach(s);
        break;
      /* user sample slots: the header is checked like the firmware's ed_smp_end() */
      case CMD.SMP_BEGIN: case CMD.SMP_ERASE: {
        if (a.length < 1 || a[0] >= 3) return null;
        const u = st.smp[a[0]];
        if (cmd === CMD.SMP_ERASE) u.flash.fill(0xFF); else u.flash.fill(0xFF, 0, 4096);
        u.zones = 0; u.name = ""; u.len = 0; u.next = SMP.DATA_OFF; u.mix = SMP.MIX0();
        b(a[0]); b(0);
        break;
      }
      case CMD.SMP_WRITE: {
        if (a.length < 5 || a[0] >= 3) return null;
        const u = st.smp[a[0]], off = a[1] | (a[2] << 7) | (a[3] << 14), dat = unpack7(a.slice(4));
        let rc = 0;
        if (off < SMP.DATA_OFF || (off & 0xFF) || !dat.length || off + dat.length > SMP.SLOT_SIZE || dat.length > 256) rc = 1;
        else {
          if (!(off & 0xFFF)) u.flash.fill(0xFF, off, off + 4096);
          u.flash.set(dat, off);
          u.next = off + dat.length;
        }
        b(a[0]); b(off); b(off >> 7); b(off >> 14); b(rc);
        break;
      }
      case CMD.SMP_END: {
        if (a.length < 2 || a[0] >= 3) return null;
        const u = st.smp[a[0]], hd = unpack7(a.slice(1)), dv = new DataView(hd.buffer);
        let rc = 0;
        if (hd.length < SMP.HDR_LEN || dv.getUint32(0, true) !== 0x504D5346 || dv.getUint16(4, true) !== 1) rc = 2;
        else if (!hd[6] || hd[6] > 16) rc = 5;
        else {
          const len = dv.getUint32(16, true);
          if (len > SMP.MAX_DATA) rc = 1;
          else if (crc32(u.flash.subarray(SMP.DATA_OFF, SMP.DATA_OFF + len)) !== dv.getUint32(20, true)) rc = 3;
          else {
            u.flash.set(hd, 0);
            u.zones = hd[6]; u.len = len;
            u.name = String.fromCharCode(...hd.slice(8, 16)).replace(/\0.*$/, "");
          }
        }
        b(a[0]); b(rc);
        break;
      }
      case CMD.SMP_MIX: {                             /* (#21) as editor.c ed_smp_mix */
        if (!songOn() || a.length < 1 || a[0] >= 3 || (a.length !== 1 && a.length !== 49)) return null;
        const u = st.smp[a[0]];
        const rc = a.length === 49 ? (u.zones ? 0 : 1) : 0;
        if (a.length === 49 && !rc) u.mix = a.slice(1);
        b(a[0]); b(rc); b(u.zones);
        for (let i = 0; i < u.zones; i++) { b(u.flash[32 + i * 28 + 25]); b(u.flash[32 + i * 28 + 26]); }
        u.mix.forEach(b);
        break;
      }
      case CMD.SMP_INFO:
        b(3); b(SMP.SLOT_SIZE / 1024);
        st.smp.forEach((u) => { b(u.zones); s(u.zones ? u.name : ""); b(u.zones ? Math.ceil(u.len / 1024) : 0); });
        break;
      default:
        return null;
    }
    if ([CMD.UP_PUT, CMD.UP_STORE, CMD.UP_ERASE].includes(cmd) && out[1] === 0) st.bankSig++;
    return frame(cmd, out);
  }

  /* a WebMIDI-like access object: one input and one output named "Felucca" */
  const input = { id: "mock-in", name: "Felucca", type: "input", state: "connected", onmidimessage: null };
  let busy = false;
  const output = {
    id: "mock-out", name: "Felucca", type: "output", state: "connected",
    send(data) {
      const f = unframe(data);
      if (!f) { console.error("mock: refused a frame that is not F0 7D 46 4C ... F7", data); return; }
      if (busy) { console.warn("mock: frame dropped (device holds only one frame)", data); return; }
      busy = true;
      watching();                                   /* a lapsed WATCH ends before this request counts */
      st.lastReq = Date.now();
      const flash = [CMD.UP_PUT, CMD.UP_STORE, CMD.UP_ERASE].includes(f.cmd) && !opt.legacy;
      setTimeout(() => {
        busy = false;
        const r = handle(f.cmd, f.a);
        if (r && input.onmidimessage) input.onmidimessage({ data: Uint8Array.from(r) });
        const ra = r ? r.slice(5, -1) : [];
        if (r && ((!syncCaps() && ((f.cmd === CMD.SET && f.a[0] === 1 && f.a[1] === G_ENGSEL) || f.cmd === CMD.PRESET))
          || (f.cmd === CMD.PROJECT && f.a[0] === 0 && ra[2]) || (f.cmd === CMD.UP_LOAD && !ra[1]))) reloadPush();
      }, f.cmd === CMD.SMP_ERASE ? 900 : f.cmd === CMD.SMP_BEGIN ? 120 : flash ? 150 : f.cmd === CMD.SMP_WRITE ? 25 + Math.random() * 10 : 4 + Math.random() * 12);
    },
  };
  /* WATCH ends by itself watchMs after the last request */
  function watching() {
    if (st.watch && Date.now() - st.lastReq > watchMs) st.watch = false;
    return st.watch;
  }
  function push(cmd, args) {
    if (!watching()) return false;
    const fr = Uint8Array.from(frame(cmd, args));
    setTimeout(() => { if (input.onmidimessage) input.onmidimessage({ data: fr }); }, 0);
    return true;
  }
  /* INFO 53 01 caps (firmware after 1.0): no RELOAD echo of the editor's own PRESET / G_ENGSEL */
  const syncCaps = () => (!opt.legacy && !opt.v3 && !opt.v5 && !opt.noFm6 && !opt.noSync && st.uiCaps ? 3 : 0);
  const reloadPush = () => push(CMD.RELOAD, opt.legacy ? [st.engine, st.preset] : [st.engine, st.preset, st.sel]);
  /* things done on the device itself */
  const sim = {
    knob(id = [9, 33, 35, P_E0 + 4][Math.floor(Math.random() * 4)], dv = Math.random() < 0.5 ? -4 : 4) {
      const d = desc(0, id);
      st.p[id] = clamp(st.p[id] + dv, d.min, d.max);
      push(CMD.CHANGED, [...widOut(0, id), ...v14enc(st.p[id])]);
      return { id, value: st.p[id] };
    },
    reload(pi = st.preset + 1) {
      applyPreset(pi);
      reloadPush();
      return { engine: st.engine, preset: st.preset };
    },
    track(i = (st.sel + 1) % NTRK) {                /* TRACKS page KNOB 1 */
      st.sel = i;
      reloadPush();
      return i;
    },
    /* TRACKS page KNOB 2: the selected track's level; pushes CHANGED */
    level(v) {
      st.p[0] = v = clamp(v, 0, 127);
      push(CMD.CHANGED, [0, 0, ...v14enc(v)]);
      return v;
    },
    mute(on = !st.p[40]) { st.p[40] = on ? 1 : 0; push(CMD.CHANGED, [0, 40, ...v14enc(st.p[40])]); return st.p[40]; },
    /* a parameter of track i changed on the device: CHANGED for the selected track, else TRACK_CHANGED (v4 watch) */
    param(i, id, val) {
      const t = st.tracks[i], d = id >= P_E0 ? ENG[t.engine].edit[id - P_E0] : TP[id];
      t.p[id] = clamp(val, d.min, d.max);
      if (i === st.sel) push(CMD.CHANGED, [...widOut(0, id), ...v14enc(t.p[id])]);
      else if (st.v4) push(CMD.TRACK_CHANGED, [i | (id >> 7 & 1) << 6, id & 127, ...v14enc(t.p[id])]);
      return t.p[id];
    },
    /* REC on TRACKS: arm / disarm live recording of a track (no push: the editor reads TRACK) */
    arm(i = st.sel) { st.rec ^= 1 << i; return (st.rec >> i) & 1; },
    step(i = Math.floor(Math.random() * 16)) {
      const x = st.step[i];
      if (x.n) x.flags ^= 1;
      else Object.assign(x, { n: 1, notes: [60 + Math.floor(Math.random() * 12), 0, 0, 0], time: 0, flags: 0, vel: 96 });
      push(CMD.STEP_CHANGED, opt.legacy ? [i] : [i, st.sel]);
      return i;
    },
  };
  if (opt.auto !== false) st.rec = 1 << 2;          /* the browser mock: track 3 armed, to show it */
  const timers = opt.auto === false ? [] : [
    setInterval(() => sim.knob(), 3000),
    setInterval(() => sim.step(), 11000),
    setInterval(() => sim.reload(), 27000),
    setInterval(() => sim.param((st.sel + 1) % NTRK, 39, Math.round(Math.random() * 80) - 40), 13000),   /* pan of another track */
  ];
  return {
    state: st, sim,
    tables: { TP, GP, ENG, PATTERNS, P_COUNT, G_COUNT, NSTEP, P_E0, G_ENGSEL, P_SLCR, NTRK,
      FM6: { bank: 0, own: FM6_OWN, init: FM6.INIT_PK, factory: FM6.FACTORY_PK } },   /* test_web.mjs: == the firmware */
    stop: () => timers.forEach(clearInterval),
    access: { sysexEnabled: true, inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null },
  };
}
/* Optional preferences: old firmware is never probed with unknown commands. */
async function readDevicePreferences(rq, info, names, previous = null, fresh = false) {   /* (fresh: THEME CUSTOM changed) */
  if (!info.uiCaps) return null;
  const state = parse[CMD.UI_STATE](await rq(req.uiState()));
  const palettes = previous && !fresh && state.palette < previous.palettes.length ? previous.palettes :   /* ((Skiff #27) */
    parse[CMD.UI_PALETTES](await rq(req.uiPalettes()));                                         /* CUSTOM comes, goes) */
  const colors = !(state.caps & 16) ? null : previous && previous.colors && !fresh && state.palette === previous.state.palette ?
    previous.colors : parse[CMD.COLORS](await rq(req.colors()));
  let favorites = previous ? previous.favorites : [], slots = previous ? previous.slots : null;
  if (state.caps & 8) {
    if (!previous || state.bankSig !== previous.state.bankSig) slots = await bank.list(rq);
    if (!previous || state.favoriteSig !== previous.state.favoriteSig || state.bankSig !== previous.state.bankSig) {
      favorites = [];
      for (let engine = 0; engine <= info.nengines; engine++) {
        const total = engine === info.nengines ? slots.total : (names[engine] || []).length;
        const flags = favorites[engine] = [];
        for (let start = 0; start < total; start += 32) {
          const count = Math.min(32, total - start);
          const r = parse[CMD.FAV_GET](await rq(req.favGet(engine, start, count)));
          if (r.rc || r.engine !== engine || r.start !== start || r.count !== count) throw new Error("Invalid favorites reply");
          flags.push(...r.values);
        }
      }
    }
  }
  return { state, palettes, favorites, slots, colors };
}
/* an enum value or a preset named like another is an alias kept for stored numbers: the device loads the original,
   the lists hide the alias (shown when set). The original: the first entry when it has that name (SAMPLE / GRAIN 1
   and 4, once TRANH and PERC: PIANO 0), else the last with it (DRUM KIT 1..3, once HAND CYM H+CYM: 66 10 77 at 6 5 8;
   EDITOR_PROTOCOL.md). -> the original's index */
function aliasOf(names, i) {
  if (!names || names[i] == null) return i;
  const k = names[0] === names[i] ? 0 : names.lastIndexOf(names[i]);
  return k >= 0 ? k : i;
}

/* #48: note divisions (1/4, 8T, 2BAR, ...) are listed by length, longest first, as the device's knobs step them
   (src/params.c enum_order); the values stay. Any other list: in value order. -> d's values in the order shown */
function divLength(n) {
  const d = /^(\d+)\/(\d+)D$/.exec(n);           /* ((1.3) DELAY TIME's dotted ones: half again) */
  if (d) return 1.5 * +d[1] / +d[2];
  const m = /^(\d+)\/(\d+)$/.exec(n) || /^(\d+)(T|BAR)$/.exec(n);
  return !m ? null : m[2] === "BAR" ? +m[1] : m[2] === "T" ? 2 / 3 / +m[1] : +m[1] / +m[2];
}
function enumShown(d) {
  const vals = [];
  for (let v = d.min; v <= d.max; v++) vals.push(v);
  const len = d.fmt === F.ENUM && d.names ? d.names.map(divLength) : [null];
  return len.includes(null) ? vals : vals.sort((a, b) => len[b - d.min] - len[a - d.min] || a - b);
}

/* the order the device shows its engines in (src/engines.c ENGINE_ORDER): the lists here follow it, the protocol keeps
   the engine numbers. engineOrder(names): the indices of names in that order, "-" (a reserved number) left out; a name
   the list does not know (another firmware) follows in index order */
const ENGINE_ORDER = ["ANALOG", "FM6", "DIGITAL", "PHASE", "LOFI", "SAMPLE", "VOICE", "TRIO", "WHEEL", "GRAIN", "PHYS", "NOISE",
  "SLICE", "DRUM", "DRUM-X"];
function engineOrder(names) {
  const rank = (n) => { const k = ENGINE_ORDER.indexOf(n); return k < 0 ? ENGINE_ORDER.length : k; };
  return (names || []).map((n, i) => i).filter((i) => names[i] !== "-")
    .sort((a, b) => rank(names[a]) - rank(names[b]) || a - b);
}

function devicePresetRows(info, names, preferences) {
  if (!preferences || !(preferences.state.caps & 8)) return [];
  const rows = engineOrder(info.engines).filter((engine) => names[engine]).flatMap((engine) => names[engine]
    .map((name, preset) => ({ engine, preset, name, user: false })).filter((row) => aliasOf(names[engine], row.preset) === row.preset));
  for (const slot of preferences.slots.slots) if (slot.used)
    rows.push({ engine: info.nengines, preset: slot.slot, name: slot.name, user: true });
  return rows.map((row) => ({ ...row, favorite: !!(preferences.favorites[row.engine] || [])[row.preset] }))
    .filter((row) => !preferences.state.filter || row.favorite);
}

/*PROTO-END*/
