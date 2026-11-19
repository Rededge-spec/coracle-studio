/* SPDX-License-Identifier: GPL-3.0-only
 * Coracle Studio: the FM-1 side. Talks to the FM-1 running CORACLE (Skiff Simple) firmware over USB-MIDI SysEx with
 * Skiff's own editor protocol (proto.js, from Skiff's web editor by Leo Kuroshita / Hugelton Instruments and the Skiff
 * authors, GPL-3.0). No DOM here: app.js draws, server.py relays Claude's commands, tests run this against
 * proto.js's simulated FM-1. Tracks are numbered 1..6 to the outside world. */
"use strict";

const P_ID = { LEVEL: 0, SPEED: 8, LOOP: 29, DIV: 30, SWING: 31, DLY: 35, REV: 36, PAN: 39, MUTE: 40 };   /* firmware core.h P_* */
const G_ID = { BPM: 0, SWING: 1, DTIME: 4, DFDBK: 5, RSIZE: 8 };
const ECHO_TIMES = ["1/4", "1/8", "1/16", "1/32", "8T", "16T", "1/2", "1/1", "2BAR", "4BAR", "1/8D", "1/16D", "1/4D"];
const pct = (v, max = 127) => Math.round(v * 100 / max);
const ENGINE_SAMPLE = 4, ENGINE_DRUM = 10;
const LANE_WORDS = { KICK: 0, BD: 0, BASS: 0, SNARE: 1, SD: 1, SN: 1, CLAP: 2, CP: 2, HAT: 3, HH: 3, HATCL: 3, CH: 3, CLOSED: 3,
  OPEN: 4, OH: 4, HATOP: 4, OPENHAT: 4, TOM: 5, CONGA: 5, RIM: 6, CLAVE: 6, RS: 6, BELL: 7, COWBELL: 7, CYM: 7, RIDE: 7 };
const P_LN0 = 83, P_LTUNE0 = 101;   /* CORACLE / Skiff 2.x core.h: the DRUM lanes' LEVEL (0..127) and TUNE (64 = 0, 3/16 st a unit) */
const tuneToSt = (v) => Math.round((v - 64) * 3 / 16 * 10) / 10, stToTune = (s) => Math.max(0, Math.min(127, 64 + Math.round(s * 16 / 3)));
const QUALITY = { high: 22050, long: 11025, longest: 8000 };   /* a user slot: ~7.4 s, ~14.8 s, ~20 s */

function noteNum(tok) {
  if (/^\d+$/.test(tok)) { const n = +tok; if (n <= 127) return n; }
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(tok);
  if (!m) throw new Error(`"${tok}" isn't a note (use names like C4, F#3, Bb2)`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  const n = base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  if (n < 0 || n > 127) throw new Error(`"${tok}" is out of range`);
  return n;
}
const REST = () => ({ n: 0, notes: [0, 0, 0, 0], time: 2, flags: 0, vel: 0, hit: 0, acc: 0, chance: 100, ratchet: 1 });

/* "C4 . E4 - G4+B4 ." -> steps: a note (chord with +), "." rest, "-" hold the note before; ">" in front: accent */
function parseMelody(text) {
  const toks = String(text).trim().split(/[\s,|]+/).filter(Boolean);
  if (!toks.length) throw new Error("No steps given");
  if (toks.length > 64) throw new Error("At most 64 steps");
  let prevNote = false;
  return toks.map((t, i) => {
    if (t === "." || t === "_" || t === "0") { prevNote = false; return REST(); }
    if (t === "-" || t === "~") {
      if (!prevNote) throw new Error(`Step ${i + 1} holds, but no note is playing before it`);
      return { ...REST(), time: 1 };
    }
    const acc = t.startsWith(">"), notes = (acc ? t.slice(1) : t).split("+").map(noteNum).slice(0, 4);
    prevNote = true;
    return { n: notes.length, notes: [...notes, 0, 0, 0, 0].slice(0, 4), time: 0, flags: acc ? 1 : 0, vel: acc ? 120 : 100,
      hit: 0, acc: 0, chance: 100, ratchet: 1 };
  });
}
/* {kick: "x...x...", snare: "....X..."} -> steps: x a hit, X an accented hit, "." nothing */
function parseDrums(lanes) {
  const rows = Object.entries(lanes || {});
  if (!rows.length) throw new Error("Give at least one lane, e.g. {\"kick\": \"x...x...x...x...\"}");
  let len = 0;
  const parsed = rows.map(([name, pat]) => {
    const l = LANE_WORDS[String(name).toUpperCase().replace(/[^A-Z]/g, "")];
    if (l == null) throw new Error(`"${name}" isn't a drum lane (kick, snare, clap, hat, openhat, tom, rim, bell)`);
    const cells = String(pat).replace(/[\s|]/g, "");
    if (/[^xX.\-o0]/.test(cells)) throw new Error(`Lane ${name}: use x (hit), X (accent) and . (nothing)`);
    len = Math.max(len, cells.length);
    return [l, cells];
  });
  if (len > 64) throw new Error("At most 64 steps");
  return Array.from({ length: len }, (_, i) => {
    let hit = 0, acc = 0;
    for (const [l, cells] of parsed) {
      const c = cells[i] || ".";
      if (c === "x" || c === "X" || c === "o") hit |= 1 << l;
      if (c === "X") acc |= 1 << l;
    }
    return hit ? { n: 0, notes: [0, 0, 0, 0], time: 0, flags: 0, vel: 100, hit, acc, chance: 100, ratchet: 1 } : REST();
  });
}
function stepsText(steps, drum) {
  if (drum) {
    return LANES.map((nm, l) => [nm.toLowerCase(), steps.map((s) => (s.hit >> l & 1 ? (s.acc >> l & 1 ? "X" : "x") : ".")).join("")])
      .filter(([, row]) => row.includes("x") || row.includes("X"));
  }
  return steps.map((s) => s.time === 1 ? "-" : s.time === 2 || !s.n ? "." :
    (s.flags & 1 ? ">" : "") + s.notes.slice(0, s.n).map(noteName).join("+")).join(" ");
}

/* a user slot's data at any rate (buildSlot's, with the zone's rate field set from it) */
function buildSlotAt(name, samples, rate) {
  const built = buildSlot(name, [{ s: samples, root: 60 }]);
  const v = new DataView(built.hdr.buffer);
  v.setUint32(32 + 16, pyRound(rate / 44100 * 65536) >>> 0, true);
  return built;
}

class Studio {
  constructor(log = () => {}) {
    this.log = log;
    this.dev = null;               /* {link, input, output, info} */
    this.names = {};               /* engine -> preset names */
    this.clip = null;              /* the sample being prepared: {raw: Float32Array (mono), sr, name, start, end} */
    this.raw = [];                 /* each track's steps as last read or written (the page's editing works on these) */
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(what) { for (const f of this.listeners) try { f(what); } catch (e) { /* a view's problem */ } }

  /* ---------------------------------------------------------------- connection */
  async connect(access) {
    if (this.dev) return this.dev.info;
    const pairs = portPairs(access);
    if (!pairs.length) throw new Error("No FM-1 found. Plug it in with a USB data cable (and an OTG adapter on a tablet).");
    for (const [i, o] of pairs) {
      const link = new Link((d) => o.send(d), { timeout: 400, onUnknown: () => {}, onTimeout: () => {}, onPush: () => this.changed("push") });
      i.onmidimessage = (e) => link.receive(e.data);
      if (i.open) await i.open().catch(() => {});
      try {
        const info = parse[CMD.INFO](await link.request(req.info(), { timeout: 800, retries: 2 }));
        this.dev = { link, input: i, output: o, info };
        try { await link.request(req.watch(3), { timeout: 600, retries: 1 }); } catch (e) { /* no pushes: the page refreshes by hand */ }
        this.names = {}; this._all = null;
        this.changed("connected");
        return info;
      } catch (e) {
        link.closed = true;
        i.onmidimessage = null;
      }
    }
    throw new Error("The FM-1 didn't answer. Check it's on and running the CORACLE firmware, then try again.");
  }
  drop() {
    if (!this.dev) return;
    try { this.dev.link.close(); this.dev.input.onmidimessage = null; } catch (e) { /* gone */ }
    this.dev = null;
    this.changed("disconnected");
  }
  need() { if (!this.dev) throw new Error("The FM-1 isn't connected. Plug it in and press Connect (or call connect)."); return this.dev; }
  async rq(r, opt) { const d = this.need(); return parse[r[0]](await d.link.request(r, opt), d.info); }
  trk(n) {
    const t = Number(n);
    if (!Number.isInteger(t) || t < 1 || t > (this.dev?.info.ntrk || 6)) throw new Error(`Track must be 1 to ${this.dev?.info.ntrk || 6}`);
    return t - 1;
  }

  /* ---------------------------------------------------------------- reading */
  async soundNames(engine) {
    if (!this.names[engine]) this.names[engine] = (await this.rq(req.names(engine))).names;
    return this.names[engine];
  }
  async trackSteps(k, len) {
    const out = [];
    for (let i = 0; i < len; i++) out.push(await this.rq(req.trackStep(k, i)));
    return out;
  }
  async state(opt = {}) {
    const d = this.need(), info = d.info;
    const tr = await this.rq(req.track());
    const bpm = (await this.rq(req.get(1, G_ID.BPM))).value, swing = (await this.rq(req.get(1, G_ID.SWING))).value;
    let playing = null;
    if (info.skiff & 1) playing = (await this.rq(req.transport())).playing;
    const tracks = [];
    for (let k = 0; k < tr.ntrk; k++) {
      const t = tr.tracks[k], names = await this.soundNames(t.engine);
      const loop = (await this.rq(req.trackParam(k, P_ID.LOOP))).value;
      const speedV = (await this.rq(req.trackParam(k, P_ID.SPEED))).value;
      const echo = (await this.rq(req.trackParam(k, P_ID.DLY))).value, reverb = (await this.rq(req.trackParam(k, P_ID.REV))).value;
      const row = { track: k + 1, sound: names[t.preset] || `#${t.preset}`, engine: info.engines[t.engine] || String(t.engine),
        drum: t.engine === ENGINE_DRUM || info.engines[t.engine] === "DRUM-X", volume: t.level, muted: !!t.mute,
        loop, speed: +(2 ** (speedV / 24)).toFixed(2), echo: pct(echo), reverb: pct(reverb) };
      if (opt.steps !== false) { this.raw[k] = await this.trackSteps(k, loop); row.steps = stepsText(this.raw[k], row.drum); }
      if (row.drum && opt.kit !== false) { try { row.kit = await this.kitOf(k); } catch (e) { /* firmware without lane pitch */ } }
      tracks.push(row);
    }
    const si = await this.rq(req.smpInfo());
    const fx = { echo_time: ECHO_TIMES[(await this.rq(req.get(1, G_ID.DTIME))).value] || "?",
      echo_feedback: pct((await this.rq(req.get(1, G_ID.DFDBK))).value, 120), reverb_size: pct((await this.rq(req.get(1, G_ID.RSIZE))).value) };
    return { connected: true, firmware: info.version, bpm, swing, playing, selected: tr.sel + 1, fx, tracks,
      sample_slots: si.slots.map((s, i) => ({ slot: i + 1, name: s.name || null, empty: !s.zones })) };
  }
  async listSounds(engine) {
    const info = this.need().info, out = [];
    for (let e = 0; e < info.nengines; e++) {
      const nm = info.engines[e];
      if (nm === "-" || (engine && nm !== String(engine).toUpperCase())) continue;
      out.push({ engine: nm, sounds: await this.soundNames(e) });
    }
    if (!out.length) throw new Error(`No engine called ${engine}`);
    return out;
  }

  /* ---------------------------------------------------------------- writing */
  async findSound(sound, engine) {
    const info = this.need().info, want = String(sound).trim().toUpperCase();
    const engines = engine ? [info.engines.indexOf(String(engine).toUpperCase())] : [...info.engines.keys()];
    if (engine && engines[0] < 0) throw new Error(`No engine called ${engine}. Engines: ${info.engines.filter((x) => x !== "-").join(", ")}`);
    let close = null;
    for (const e of engines) {
      if (info.engines[e] === "-") continue;
      const names = await this.soundNames(e);
      const i = names.findIndex((n) => n.toUpperCase() === want);
      if (i >= 0) return [e, i];
      const j = names.findIndex((n) => n.toUpperCase().includes(want));
      if (j >= 0 && !close) close = [e, j];
    }
    if (close) return close;
    throw new Error(`No sound called "${sound}". list_sounds shows them.`);
  }
  async select(k) {
    const tr = await this.rq(req.track(k));
    if (tr.sel !== k) throw new Error(`Couldn't select track ${k + 1}`);
  }
  async setSound(track, sound, engine) {
    const k = this.trk(track), [e, p] = await this.findSound(sound, engine);
    await this.select(k);
    const r = await this.rq(req.preset(e, p));
    if (r.engine !== e) throw new Error(`Track ${track} can't play ${this.dev.info.engines[e]} sounds (tracks 5 and 6 can't play GRAIN or PHYS)`);
    this.changed("tracks");
    return `Track ${track}: ${(await this.soundNames(e))[p]} (${this.dev.info.engines[e]})`;
  }
  async writeSteps(k, steps) {
    for (let i = 0; i < steps.length; i++) await this.rq(req.trackStep(k, i, steps[i]));
    this.raw[k] = steps.map((s) => ({ ...s }));
    await this.rq(req.trackParam(k, P_ID.LOOP, steps.length));
    this.changed("tracks");
  }
  async setSteps(track, steps) { const k = this.trk(track), s = parseMelody(steps); await this.writeSteps(k, s); return `Track ${track}: ${s.length} steps written`; }
  async setDrums(track, lanes) { const k = this.trk(track), s = parseDrums(lanes); await this.writeSteps(k, s); return `Track ${track}: ${s.length} drum steps written`; }
  /* one step, as the page edits it: kind "off", "on" (a note: the nearest note's, else C4; a drum lane: a hit), "hold",
     "accent" (a drum lane's accented hit); lane for drum tracks. Turning a note off takes its holds with it */
  async editStep(track, i, kind, lane = null) {
    const k = this.trk(track), steps = this.raw[k];
    if (!steps || i < 0 || i >= steps.length) throw new Error("Read the FM-1 first (Refresh)");
    const writes = [];
    if (lane != null) {
      const s = { ...REST(), ...steps[i], notes: [...(steps[i].notes || [0, 0, 0, 0])] }, b = 1 << lane;
      s.hit = (s.hit | 0) & ~b; s.acc = (s.acc | 0) & ~b;
      if (kind !== "off") { s.hit |= b; if (kind === "accent") s.acc |= b; }
      s.time = s.hit || s.n ? 0 : 2;
      if (!s.n) s.notes = [0, 0, 0, 0];
      s.vel = s.vel || 100;
      writes.push([i, s]);
    } else if (kind === "on") {
      let src = null;
      for (let d = 1; d < steps.length && !src; d++)
        for (const j of [i - d, i + d]) if (j >= 0 && j < steps.length && steps[j].time === 0 && steps[j].n) { src = steps[j]; break; }
      writes.push([i, { ...REST(), n: src ? src.n : 1, notes: src ? [...src.notes] : [60, 0, 0, 0], time: 0, vel: 100 }]);
    } else if (kind === "hold") {
      if (!(i > 0 && (steps[i - 1].time === 1 || (steps[i - 1].time === 0 && steps[i - 1].n)))) throw new Error("A hold needs a note before it");
      writes.push([i, { ...REST(), time: 1 }]);
    } else {
      writes.push([i, REST()]);
      for (let j = i + 1; j < steps.length && steps[j].time === 1; j++) writes.push([j, REST()]);
    }
    for (const [j, s] of writes) { await this.rq(req.trackStep(k, j, s)); steps[j] = s; }
    this.changed("steps");
  }
  /* a note step moved up or down (a chord moves together), semitones */
  async pitchStep(track, i, semis) {
    const k = this.trk(track), steps = this.raw[k];
    if (!steps || !steps[i] || !(steps[i].time === 0 && steps[i].n)) throw new Error("That step has no note");
    const s = steps[i], notes = s.notes.map((x, j) => (j < s.n && x ? x + semis : x));
    if (notes.slice(0, s.n).some((x) => x < 12 || x > 120)) throw new Error("That's as far as it goes");
    const ns = { ...s, notes };
    await this.rq(req.trackStep(k, i, ns));
    steps[i] = ns;
    this.changed("steps");
    return notes.slice(0, s.n).map((x) => NOTE_NAMES[x % 12] + (Math.floor(x / 12) - 1)).join(" ");
  }
  async clearTrack(track) {
    const k = this.trk(track), len = (await this.rq(req.trackParam(k, P_ID.LOOP))).value;
    for (let i = 0; i < Math.max(len, 16); i++) await this.rq(req.trackStep(k, i, REST()));
    if (this.raw[k]) this.raw[k] = this.raw[k].map(() => REST());
    this.changed("tracks");
    return `Track ${track} cleared`;
  }
  async setTrack(track, a = {}) {
    const k = this.trk(track), done = [];
    if (a.loop != null) { const v = Math.max(1, Math.min(64, Math.round(a.loop))); await this.rq(req.trackParam(k, P_ID.LOOP, v)); done.push(`loop ${v} steps`); }
    if (a.speed != null) {
      const v = Math.max(-48, Math.min(48, Math.round(24 * Math.log2(Math.max(0.25, Math.min(4, Number(a.speed)))))));
      await this.rq(req.trackParam(k, P_ID.SPEED, v)); done.push(`speed x${(2 ** (v / 24)).toFixed(2)}`);
    }
    if (a.volume != null) { const v = Math.max(0, Math.min(127, Math.round(a.volume))); await this.rq(req.trackParam(k, P_ID.LEVEL, v)); done.push(`volume ${v}`); }
    if (a.muted != null) { await this.rq(req.trackParam(k, P_ID.MUTE, a.muted ? 1 : 0)); done.push(a.muted ? "muted" : "unmuted"); }
    if (a.swing != null) { const v = Math.max(0, Math.min(100, Math.round(a.swing))); await this.rq(req.trackParam(k, P_ID.SWING, v)); done.push(`swing ${v}%`); }
    if (a.echo != null) { const v = Math.max(0, Math.min(127, Math.round(a.echo * 1.27))); await this.rq(req.trackParam(k, P_ID.DLY, v)); done.push(`echo ${pct(v)}%`); }
    if (a.reverb != null) { const v = Math.max(0, Math.min(127, Math.round(a.reverb * 1.27))); await this.rq(req.trackParam(k, P_ID.REV, v)); done.push(`reverb ${pct(v)}%`); }
    this.changed("tracks");
    return done.length ? `Track ${track}: ${done.join(", ")}` : "Nothing to change";
  }
  async setTempo(bpm) { const v = Math.max(40, Math.min(240, Math.round(bpm))); await this.rq(req.set(1, G_ID.BPM, v)); this.changed("song"); return `Tempo ${v} BPM`; }
  async setSwing(pct) { const v = Math.max(0, Math.min(100, Math.round(pct))); await this.rq(req.set(1, G_ID.SWING, v)); this.changed("song"); return `Swing ${v}% (every track)`; }
  /* the echo and reverb every track sends to: echo time (a note value), how long the echo repeats, the room's size */
  async setFx(a = {}) {
    const done = [];
    if (a.echo_time != null) {
      const i = ECHO_TIMES.indexOf(String(a.echo_time).toUpperCase());
      if (i < 0) throw new Error(`Echo time is one of ${ECHO_TIMES.join(", ")}`);
      await this.rq(req.set(1, G_ID.DTIME, i)); done.push(`echo time ${ECHO_TIMES[i]}`);
    }
    if (a.echo_feedback != null) { const v = Math.max(0, Math.min(120, Math.round(a.echo_feedback * 1.2))); await this.rq(req.set(1, G_ID.DFDBK, v)); done.push(`echo repeats ${pct(v, 120)}%`); }
    if (a.reverb_size != null) { const v = Math.max(0, Math.min(127, Math.round(a.reverb_size * 1.27))); await this.rq(req.set(1, G_ID.RSIZE, v)); done.push(`reverb size ${pct(v)}%`); }
    this.changed("song");
    return done.length ? done.join(", ") : "Nothing to change";
  }
  /* each track's step playing (the CORACLE firmware's TRANSPORT tail; null where it isn't or the firmware doesn't say) */
  async playheads() {
    const a = await this.need().link.request(req.transport(), { timeout: 300, retries: 0 });
    const o = parse[CMD.TRANSPORT](a);
    return { playing: o.playing, steps: o.steps };
  }
  async allSounds() {
    if (!this._all) this._all = await this.listSounds();
    return this._all;
  }
  async transport(op) {
    if (!(this.need().info.skiff & 1)) throw new Error("This firmware can't be started or stopped from here");
    await this.rq(req.transport(op));
    this.changed("song");
    return op === 1 ? "Playing" : op === 2 ? "Stopped" : "Restarted";   /* (the reply is from before the FM-1 acts on it) */
  }

  /* ---------------------------------------------------------------- a drum track's parts: level and pitch of each */
  async kitOf(k) {
    const out = {};
    for (let l = 0; l < 8; l++) {
      const lv = (await this.rq(req.trackParam(k, P_LN0 + l))).value, tu = (await this.rq(req.trackParam(k, P_LTUNE0 + l))).value;
      out[LANES[l].toLowerCase()] = { level: pct(lv), tune: tuneToSt(tu) };
    }
    return out;
  }
  async setKit(track, lanes) {
    const k = this.trk(track), done = [];
    for (const [name, v] of Object.entries(lanes || {})) {
      const l = LANE_WORDS[String(name).toUpperCase().replace(/[^A-Z]/g, "")];
      if (l == null) throw new Error(`"${name}" isn't a drum part (kick, snare, clap, hat, openhat, tom, rim, bell)`);
      const nm = LANES[l].toLowerCase();
      if (v.level != null) { const x = Math.max(0, Math.min(100, +v.level)); await this.rq(req.trackParam(k, P_LN0 + l, Math.round(x * 127 / 100))); done.push(`${nm} ${Math.round(x)}%`); }
      if (v.tune != null) { const s = Math.max(-12, Math.min(12, +v.tune)); await this.rq(req.trackParam(k, P_LTUNE0 + l, stToTune(s))); done.push(`${nm} ${s >= 0 ? "+" : ""}${tuneToSt(stToTune(s))} st`); }
    }
    this.changed("tracks");
    return `Track ${track}: ${done.join(", ") || "nothing changed"}`;
  }

  /* ---------------------------------------------------------------- the song: each track's list of parts (FM-1 SONG) */
  async lists(op = 0, k = 0, e = 0, v = null) {
    const d = this.need();
    if (!(d.info.skiff & 8)) throw new Error("This firmware has no song lists");
    const two = !!(d.info.song2 & 1), r = req.list(op, k, e, v, two);
    const o = songReply(d, r, await d.link.request(r));
    if (op && o.rc && o.rc !== 2) throw new Error(["", "the FM-1 refused (an empty part, or no room)", "", "stop it playing first", "the FM-1's pattern pool is full", "the FM-1 couldn't save it"][o.rc] || `the FM-1 said ${o.rc}`);
    return o;
  }
  /* a drum part's pitch written into the pattern the track is on now (an automation record at step 1), so it goes
     with the pattern from part to part of the song */
  async kitAuto(k, kit) {
    const d = this.need();
    if (!d.info.motionMax) throw new Error("This firmware has no automation");
    await this.rq(req.motion(k, 1, { on: true }, d.info.ntrk));
    for (const [name, v] of Object.entries(kit || {})) {
      const l = LANE_WORDS[String(name).toUpperCase().replace(/[^A-Z]/g, "")];
      if (l == null) throw new Error(`"${name}" isn't a drum part`);
      if (v.tune == null) continue;
      const r = await this.rq(req.motion(k, 3, { step: 0, param: P_LTUNE0 + l, value: stToTune(+v.tune) }, d.info.ntrk));
      if (r.rc) throw new Error(r.rc === 2 ? "The FM-1's 64 automation records are all used" : r.rc === 3 ? "Stop the FM-1 first" : `The FM-1 refused the pitch change (${r.rc})`);
    }
  }
  /* parts: [{pattern, reps}] in order; pattern "A" (what the track plays now), "rest", or a name in variants;
     variants: {B: {from: "A", transpose: 2} | {steps: "..."} | {lanes: {...}}}, any of them with kit: {hat: {tune: 2}}
     (a drum part's pitch for that part of the song; A then keeps the kit's pitch as it is now). The FM-1 is stopped first. */
  async setSong(track, parts, variants = {}) {
    const k = this.trk(track);
    if (!Array.isArray(parts) || !parts.length || parts.length > 16) throw new Error("A song list has 1 to 16 parts");
    if (this.need().info.skiff & 1) await this.rq(req.transport(2));
    let L = await this.lists();
    const T = () => L.tracks[k];
    /* "A": the pattern the track is on now, with its steps */
    const curPat = T().pat;
    const tr = await this.rq(req.trackParam(k, P_ID.LOOP));
    const ids = curPat >= 0 ? { A: curPat + 1 } : {}, steps = { A: await this.trackSteps(k, tr.value) };
    const two = !!(this.dev.info.song2 & 1);
    const build = (name) => {
      const v = variants[name];
      if (!v) throw new Error(`There's no part ${name}: give it in variants`);
      if (v.steps) return parseMelody(v.steps);
      if (v.lanes) return parseDrums(v.lanes);
      const src = steps[v.from || "A"];
      if (!src) throw new Error(`Part ${name} comes from ${v.from}, which isn't made yet: put ${v.from} earlier`);
      const t = Math.round(v.transpose || 0);
      return src.map((s) => (s.time === 0 && s.n ? { ...s, notes: s.notes.map((x) => (x ? Math.max(1, Math.min(127, x + t)) : 0)) } : { ...s }));
    };
    for (let e = 0; e < parts.length; e++) {
      const p = parts[e], name = String(p.pattern ?? "A"), reps = Math.max(1, Math.min(16, Math.round(p.reps || 1)));
      if (/^rest$/i.test(name)) L = await this.lists(1, k, e, PAT_REST);
      else if (ids[name]) L = await this.lists(1, k, e, ids[name]);
      else if (name === "A") {   /* what it plays isn't kept in the pool yet: a new pattern with its steps */
        if (!two) throw new Error("This firmware can't make new patterns from here");
        L = await this.lists(7, k, e);
        ids.A = T().ent[e].pat;
        L = await this.lists(3, k, e);
        await this.writeSteps(k, steps.A);
      } else {
        const s = build(name);
        const from = ids[variants[name].from || "A"] || ids.A;
        if (from) { L = await this.lists(1, k, e, from); L = await this.lists(2, k, e); }   /* a copy of something, then its own */
        else if (two) L = await this.lists(7, k, e);
        else throw new Error("This firmware can't make new patterns from here");
        ids[name] = T().ent[e].pat;
        L = await this.lists(3, k, e);                                      /* the track onto it, to write it */
        await this.writeSteps(k, s);
        steps[name] = s;
        if (variants[name].kit) await this.kitAuto(k, variants[name].kit);
      }
      L = await this.lists(5, k, e, reps);
    }
    for (let e = parts.length; e < 16; e++) if (T().ent[e].pat) L = await this.lists(4, k, e);
    /* parts that change a drum part's pitch: A puts it back where it is now */
    const kitNames = new Set(Object.values(variants).flatMap((v) => Object.keys(v.kit || {})));
    const aAt = parts.findIndex((p) => String(p.pattern ?? "A") === "A");
    if (kitNames.size && aAt >= 0) {
      const now = await this.kitOf(k), back = {};
      for (const n of kitNames) {
        const l = LANE_WORDS[n.toUpperCase().replace(/[^A-Z]/g, "")];
        back[n] = { tune: now[LANES[l].toLowerCase()].tune };
      }
      L = await this.lists(3, k, aAt);
      await this.kitAuto(k, back);
    }
    L = await this.lists(3, k, 0);
    await this.lists(6, 1);
    this.raw[k] = null;
    this.changed("tracks");
    const say = parts.map((p) => `${/^rest$/i.test(p.pattern) ? "rest" : p.pattern ?? "A"}${(p.reps || 1) > 1 ? ` x${p.reps}` : ""}`).join(", ");
    return `Track ${track} song: ${say}. Song mode on; press Play`;
  }
  async songMode(mode) {
    const m = { off: 0, on: 1, once: 2 }[String(mode).toLowerCase()];
    if (m == null) throw new Error("Song mode is on, off or once");
    await this.lists(6, m);
    return `Song mode ${String(mode).toLowerCase()}`;
  }
  /* ---- the song view (app.js renderParts): each track's parts, how long each pattern is, and the pattern each part plays */
  async songView() {
    const d = this.need();
    if (!(d.info.skiff & 8)) return null;
    const L = await this.lists();
    let lens = null;
    if (d.info.skiff & 4) { try { lens = (await this.rq(req.pool())).pats.map((p) => p.len); } catch (e) { /* no pool: lengths unknown */ } }
    const uses = {};
    L.tracks.forEach((t) => t.ent.forEach((x) => { if (x.pat && x.pat !== PAT_REST) uses[x.pat] = (uses[x.pat] || 0) + 1; }));
    return { song: L.song, uses, tracks: L.tracks.map((t, k) => {
      const ents = [];
      for (let e = 0; e < 16; e++) {
        const x = t.ent[e];
        if (!x || !x.pat) break;
        const rest = x.pat === PAT_REST;
        ents.push({ e, pat: x.pat, rest, reps: x.reps, chain: !!x.chain, snd: x.snd || [0, 0], len: !rest && lens ? lens[x.pat - 1] || 0 : 0 });
      }
      return { k, cur: t.cur, next: t.next, pat: t.pat, ents };
    }) };
  }
  async stopIfPlaying() { if (this.need().info.skiff & 1) await this.rq(req.transport(2)); }
  /* track k (0-based) onto part e, stopped, so its notes show and edits go to that part's pattern */
  async songGo(k, e) { await this.stopIfPlaying(); await this.lists(3, k, e); this.raw[k] = null; this.changed("tracks"); return `Track ${k + 1}: part ${e + 1}`; }
  async songReps(k, e, reps) { await this.lists(5, k, e, Math.max(1, Math.min(16, reps | 0))); return `Track ${k + 1}, part ${e + 1}: x${reps}`; }
  /* a new part at the end: a copy of part e's pattern (its own, to vary) or a rest */
  async songAdd(k, from, rest = false) {
    await this.stopIfPlaying();
    const v = await this.songView(), ents = v.tracks[k].ents, n = ents.length;
    if (n >= 16) throw new Error("A track has 16 parts at most");
    if (rest) { await this.lists(1, k, n, PAT_REST); await this.lists(5, k, n, 1); return `Track ${k + 1}: a rest added`; }
    const src = ents.find((x) => x.e === from && !x.rest) || [...ents].reverse().find((x) => !x.rest);
    if (!src) {   /* no parts yet: what the track plays now becomes part 1 */
      if (!(this.dev.info.song2 & 1)) throw new Error("This firmware can't make new patterns from here");
      const steps = await this.trackSteps(k, (await this.rq(req.trackParam(k, P_ID.LOOP))).value);
      await this.lists(7, k, n); await this.lists(3, k, n); await this.writeSteps(k, steps); await this.lists(5, k, n, 1);
      return `Track ${k + 1}: part 1 is what it was playing`;
    }
    await this.lists(1, k, n, src.pat); await this.lists(2, k, n); await this.lists(5, k, n, 1);
    return `Track ${k + 1}: part ${n + 1} added, a copy of part ${src.e + 1} to change`;
  }
  async songOwn(k, e) { await this.stopIfPlaying(); await this.lists(2, k, e); return `Track ${k + 1}, part ${e + 1}: now its own copy`; }
  async songRemove(k, e) {
    await this.stopIfPlaying();
    const ents = (await this.songView()).tracks[k].ents, n = ents.length;
    if (n <= 1) throw new Error("That's the track's only part");
    for (let j = e; j < n - 1; j++) {   /* the parts after it move up one */
      const x = ents[j + 1];
      await this.lists(1, k, j, x.pat); await this.lists(5, k, j, x.chain ? 0 : x.reps);
    }
    await this.lists(4, k, n - 1);
    return `Track ${k + 1}: part ${e + 1} removed`;
  }
  /* every part's notes (pattern id -> steps), read by putting each track on each of its parts in turn; stopped, and each
     track goes back to the part it was on */
  async songNotes(onProgress = () => {}) {
    await this.stopIfPlaying();
    const v = await this.songView(), out = {}, todo = [];
    v.tracks.forEach((t) => t.ents.forEach((x) => { if (!x.rest && !todo.some((q) => q.pat === x.pat)) todo.push({ k: t.k, e: x.e, pat: x.pat, len: x.len }); }));
    let i = 0;
    for (const q of todo) {
      await this.lists(3, q.k, q.e);
      const len = q.len || (await this.rq(req.trackParam(q.k, P_ID.LOOP))).value;
      out[q.pat] = await this.trackSteps(q.k, len);
      onProgress(++i, todo.length);
    }
    for (const t of v.tracks) if (t.ents.length) await this.lists(3, t.k, t.cur >= 0 && t.cur < t.ents.length ? t.cur : 0);
    this.raw = this.raw.map(() => null); this.changed("tracks");
    return out;
  }
  async songState() {
    const L = await this.lists(), names = {};
    return { song: ["off", "on", "once"][L.song] || "off", tracks: L.tracks.map((t, k) => {
      const list = [];
      for (const e of t.ent) {
        if (!e.pat) break;
        list.push(e.pat === PAT_REST ? `rest x${e.reps}` : `pattern ${e.pat}${e.chain ? " (chained)" : ` x${e.reps}`}`);
      }
      return { track: k + 1, on_part: t.cur >= 0 ? t.cur + 1 : null, parts: list };
    }) };
  }

  /* ---------------------------------------------------------------- samples */
  setClip(raw, sr, name = "SAMPLE") {
    this.clip = { raw, sr, name: String(name).replace(/\.[a-z0-9]+$/i, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 8) || "SAMPLE", start: 0, end: raw.length / sr };
    this.changed("clip");
    return { seconds: +(raw.length / sr).toFixed(2), name: this.clip.name };
  }
  needClip() { if (!this.clip) throw new Error("No sound loaded. Load a file or record the microphone first."); return this.clip; }
  trimClip(start, end) {
    const c = this.needClip(), dur = c.raw.length / c.sr;
    const s = Math.max(0, Math.min(dur, Number(start ?? c.start))), e = Math.max(0, Math.min(dur, Number(end ?? c.end)));
    if (e - s < 0.02) throw new Error("The selection is too short");
    c.start = s; c.end = e;
    this.changed("clip");
    return { start: +s.toFixed(3), end: +e.toFixed(3), seconds: +(e - s).toFixed(2) };
  }
  /* the selection at the slot's rate, faded at its ends and normalised, as 16-bit */
  clipSamples(rate, fx = {}) {
    const c = this.needClip();
    let x = c.raw.slice(Math.floor(c.start * c.sr), Math.floor(c.end * c.sr));
    if (fx.reverse) x.reverse();
    x = resample(x, c.sr, rate);
    let pk = 0;
    for (const v of x) pk = Math.max(pk, Math.abs(v));
    const g = pk > 0 ? 0.97 / pk : 1, fade = Math.min(Math.floor(rate * 0.005), x.length >> 2);
    const out = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const f = Math.min(1, i / (fade || 1), (x.length - 1 - i) / (fade || 1));
      out[i] = Math.max(-32767, Math.min(32767, Math.round(x[i] * g * f * 32767)));
    }
    return out;
  }
  maxSeconds(quality = "high") { return (SMP.MAX_DATA * 2 - 64) / (QUALITY[quality] || QUALITY.high); }
  async sendSample(slot, opt = {}) {
    const k = Number(slot) - 1, d = this.need();
    if (!(k >= 0 && k < 3)) throw new Error("Slot must be 1, 2 or 3 (USR1..USR3)");
    const quality = QUALITY[opt.quality] ? opt.quality : "high", rate = QUALITY[quality];
    const c = this.needClip(), secs = c.end - c.start, max = this.maxSeconds(quality);
    if (secs > max + 0.01) {
      const better = Object.keys(QUALITY).find((q) => this.maxSeconds(q) >= secs);
      throw new Error(`The selection is ${secs.toFixed(1)} s; at ${quality} quality a slot holds ${max.toFixed(1)} s.` +
        (better ? ` Use quality "${better}" or trim it.` : " Trim it."));
    }
    const name = String(opt.name || c.name).toUpperCase().replace(/[^\x20-\x7E]/g, "").slice(0, 8) || "SAMPLE";
    const { hdr, data } = buildSlotAt(name, this.clipSamples(rate, opt), rate);
    let r = await this.rq(req.smpBegin(k), { timeout: 1500, retries: 0 });
    if (r.rc) throw new Error("The FM-1 refused the upload (begin " + r.rc + ")");
    for (let off = 0; off < data.length; off += 256) {
      const w = await this.rq(req.smpWrite(k, SMP.DATA_OFF + off, data.subarray(off, off + 256)), { timeout: 1500, retries: 1 });
      if (w.rc) throw new Error("Upload failed partway (write " + w.rc + "); the slot is left empty. Try again.");
      if (opt.progress) opt.progress(Math.min(1, (off + 256) / data.length));
    }
    r = await this.rq(req.smpEnd(k, hdr), { timeout: 2500, retries: 0 });
    if (r.rc) throw new Error("The FM-1 couldn't finish the upload (end " + r.rc + ")");
    this.changed("samples");
    return `${name} is in USR${k + 1} (${secs.toFixed(1)} s, ${quality} quality)`;
  }
  async useSample(track, slot) {
    const k = this.trk(track), s = Number(slot);
    if (!(s >= 1 && s <= 3)) throw new Error("Slot must be 1, 2 or 3");
    await this.select(k);
    const names = await this.soundNames(ENGINE_SAMPLE);
    const r = await this.rq(req.preset(ENGINE_SAMPLE, 0));
    if (r.engine !== ENGINE_SAMPLE) throw new Error(`Track ${track} can't play samples`);
    const pe0 = this.dev.info.pe0, dsc = await this.rq(req.desc(0, pe0));
    const i = (dsc.names || []).indexOf(`USR${s}`);
    if (i < 0) throw new Error("This firmware doesn't offer user slots on the SAMPLE engine");
    await this.rq(req.trackParam(k, pe0, i));
    this.changed("tracks");
    return `Track ${track} plays USR${s}` + (names.length ? "" : "");
  }
}
