/* SPDX-License-Identifier: GPL-3.0-only
 * Coracle Studio: the page. Draws the FM-1's state, the sampler, and runs Claude's commands (from server.py's
 * /events) through the same Studio calls the buttons use. */
"use strict";
const $ = (id) => document.getElementById(id);
const studio = new Studio();
const TOKEN = window.STUDIO_TOKEN && !window.STUDIO_TOKEN.startsWith("__") ? window.STUDIO_TOKEN : null;
const MOCK = new URLSearchParams(location.search).has("mock");
let access = null, mock = null, lastState = null;

function status(msg, err = false) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }
function log(msg) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}  ${msg}`;
  $("log").prepend(li);
  while ($("log").children.length > 40) $("log").lastChild.remove();
}
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Coracle-Studio-Token": TOKEN || "" }, body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "The server refused");
  return j;
}
/* one thing at a time on the FM-1: the buttons, the refresh and Claude's commands queue */
let chain = Promise.resolve(), pending = 0;
function serial(fn) { pending++; const p = chain.then(fn, fn).finally(() => { pending--; }); chain = p.catch(() => {}); return p; }
async function act(label, fn) {
  try { const r = await serial(fn); if (typeof r === "string") { status(r); log(r); } return r; }
  catch (e) { status(e.message, true); throw e; }
}

/* ---------------------------------------------------------------- connection */
async function midiAccess() {
  if (access) return access;
  if (MOCK) { mock = makeMockDevice({}); access = mock.access; }
  else {
    if (!navigator.requestMIDIAccess) throw new Error("This browser has no USB MIDI. Use Chrome or Edge (Opera on Android).");
    access = await navigator.requestMIDIAccess({ sysex: true });
  }
  access.onstatechange = (e) => {
    const d = studio.dev;
    if (d && e.port && e.port.state === "disconnected" && (e.port === d.input || e.port === d.output)) studio.drop();
    else if (!d && e.port && e.port.state === "connected") setTimeout(() => connect(true), 400);
  };
  return access;
}
async function connect(quiet = false) {
  if (studio.dev) return studio.dev.info;
  try {
    const info = await serial(async () => studio.connect(await midiAccess()));
    status(`Connected: ${info.version}`);
    log("FM-1 connected");
    await refresh();
    return info;
  } catch (e) { if (!quiet) status(e.message, true); throw e; }
}
studio.onChange((what) => {
  const on = !!studio.dev;
  $("chip").classList.toggle("on", on);
  $("chipTxt").textContent = on ? `FM-1 · ${studio.dev.info.version}` : "FM-1 not connected";
  $("connBtn").textContent = on ? "Disconnect" : "Connect";
  for (const id of ["playBtn", "stopBtn", "bpm", "swing", "refreshBtn", "sendBtn", "echoTime", "echoFb", "revSize"]) $(id).disabled = !on;
  if (what === "connected") soundList = null;
  if (what === "disconnected") { status("The FM-1 was disconnected."); renderTracks(null); }
  if (what === "clip") drawWave();
  if (what === "push") { clearTimeout(pushT); pushT = setTimeout(refresh, 1200); }   /* changed on the FM-1 itself */
});
let pushT = 0;
$("connBtn").onclick = () => (studio.dev ? studio.drop() : connect().catch(() => {}));

/* ---------------------------------------------------------------- tracks and song */
let refreshing = null;
function refresh() {
  if (!studio.dev) return Promise.resolve(null);
  if (refreshing) return refreshing;
  refreshing = serial(async () => { lastState = await studio.state(); return lastState; })
    .then((st) => {
      render(st);
      if (st && !soundList) serial(() => studio.allSounds()).then((l) => { soundList = l; renderTracks(lastState); }).catch(() => {});
      return st;
    }, (e) => { status(e.message, true); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
function render(st) {
  if (!st) return;
  if (document.activeElement !== $("bpm")) $("bpm").value = st.bpm;
  if (document.activeElement !== $("swing")) $("swing").value = st.swing;
  if (st.fx) {
    if (document.activeElement !== $("echoTime")) $("echoTime").value = st.fx.echo_time;
    if (document.activeElement !== $("echoFb")) $("echoFb").value = st.fx.echo_feedback;
    if (document.activeElement !== $("revSize")) $("revSize").value = st.fx.reverb_size;
  }
  $("playBtn").classList.toggle("go", !st.playing);
  renderTracks(st);
}
/* each step's look and what a click turns it into: off -> on -> hold -> off (a drum lane: off -> hit -> accent -> off) */
const LANE_LABEL = ["KICK", "SNARE", "CLAP", "HAT", "OPEN", "TOM", "RIM", "BELL"];
function melodicCell(steps, i) {
  const s = steps[i];
  const canHold = i > 0 && (steps[i - 1].time === 1 || (steps[i - 1].time === 0 && steps[i - 1].n));
  if (s.time === 0 && s.n) return { cls: "on", next: canHold ? "hold" : "off", tip: s.notes.slice(0, s.n).map(noteName).join(" "), note: true,
    label: noteName(s.notes[0]) + (s.n > 1 ? "+" : "") };
  if (s.time === 1) return { cls: "hold", next: "off", tip: "held" };
  return { cls: "", next: "on", tip: "off" };
}
function drumCell(s, l) {
  const hit = s.time === 0 && ((s.hit | 0) >> l & 1), acc = hit && ((s.acc | 0) >> l & 1);
  return acc ? { cls: "on acc", next: "off", tip: "accent" } : hit ? { cls: "on", next: "accent", tip: "hit" } : { cls: "", next: "on", tip: "off" };
}
function editCell(t, i, next, lane) {
  act("edit", () => studio.editStep(t.track, i, next, lane)).then(() => renderTracks(lastState)).catch(() => {});
}
function cellRow(t, n, look, onClick, label) {
  const wrap = document.createElement("div");
  wrap.className = "lane";
  if (label != null) { const b = document.createElement("span"); b.className = "lanelab"; b.textContent = label; wrap.append(b); }
  const cells = document.createElement("div");
  cells.className = "cells";
  for (let i = 0; i < n; i++) {
    const L = look(i), c = document.createElement("button");
    c.type = "button"; c.className = "cell " + L.cls; c.title = `Step ${i + 1}: ${L.tip}`;
    c.setAttribute("aria-label", `Track ${t.track}${label ? " " + label : ""} step ${i + 1}: ${L.tip}`);
    if (L.cls) c.style.background = `var(--t${t.track})`;
    if (i % 4 === 0) c.classList.add("beat");
    c.onclick = () => onClick(i, L.next);
    c.dataset.i = i;
    if (L.note) {   /* a note: its name on it; the mouse wheel moves it a semitone (Shift: an octave) */
      c.textContent = L.label;
      c.title += " · scroll the wheel to change the note";
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        const d = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 12 : 1);
        act("pitch", () => studio.pitchStep(t.track, i, d)).then((nm) => { c.textContent = nm.split(" ")[0] + (nm.includes(" ") ? "+" : ""); c.title = `Step ${i + 1}: ${nm} · scroll the wheel to change the note`; }).catch(() => {});
      }, { passive: false });
    }
    cells.append(c);
  }
  wrap.append(cells);
  return wrap;
}
/* a drum part's own level, solo and pitch (the kit's lanes) */
const kitSolo = {};   /* track → {lane, saved levels} */
function kitCtl(t, l, lab) {
  const name = ["kick", "snare", "clap", "hat", "openhat", "tom", "rim", "bell"][l], key = Object.keys(t.kit)[l], v = t.kit[key];
  const box = document.createElement("div"); box.className = "kitctl";
  box.innerHTML = `<span class="lanelab"></span><input type="range" min="0" max="100" class="klv" title="Level"><button type="button" class="ksolo" title="Hear this part alone">S</button><input type="number" min="-12" max="12" step="0.5" class="ktu" title="Pitch, semitones">`;
  box.querySelector(".lanelab").textContent = lab;
  const lv = box.querySelector(".klv"), so = box.querySelector(".ksolo"), tu = box.querySelector(".ktu");
  lv.value = v.level; tu.value = v.tune;
  lv.onchange = () => act("kit", () => studio.setKit(t.track, { [name]: { level: +lv.value } })).then(refresh);
  tu.onchange = () => act("kit", () => studio.setKit(t.track, { [name]: { tune: +tu.value } })).then(refresh);
  const s = kitSolo[t.track];
  so.classList.toggle("on", !!s && s.lane === l);
  so.onclick = () => act("kit solo", async () => {
    const cur = kitSolo[t.track], lanes = {};
    if (cur && cur.lane === l) {   /* off: everything back */
      Object.entries(cur.saved).forEach(([n, x]) => { lanes[n] = { level: x }; });
      delete kitSolo[t.track];
    } else {
      const saved = cur ? cur.saved : Object.fromEntries(Object.values(t.kit).map((x, i) => [["kick", "snare", "clap", "hat", "openhat", "tom", "rim", "bell"][i], x.level]));
      ["kick", "snare", "clap", "hat", "openhat", "tom", "rim", "bell"].forEach((n, i) => { lanes[n] = { level: i === l ? saved[n] || 100 : 0 }; });
      kitSolo[t.track] = { lane: l, saved };
    }
    return studio.setKit(t.track, lanes);
  }).then(refresh);
  return box;
}
/* SOLO: the others muted for now, their own mutes put back after */
let solo = null;                                   /* {track, saved: [muted per track]} */
async function setSolo(track) {
  const st = lastState; if (!st) return;
  if (solo && solo.track === track) {
    const saved = solo.saved; solo = null;
    for (const t of st.tracks) if (t.muted !== saved[t.track - 1]) await studio.setTrack(t.track, { muted: saved[t.track - 1] });
    return `Solo off: track ${track}`;
  }
  const saved = solo ? solo.saved : st.tracks.map((t) => t.muted);
  solo = { track, saved };
  for (const t of st.tracks) { const m = t.track !== track; if (t.muted !== m) await studio.setTrack(t.track, { muted: m }); }
  return `Solo: track ${track}`;
}
function renderTracks(st) {
  const box = $("tracks");
  box.textContent = "";
  $("trkHint").textContent = st ? "Click a step: off, on, held (drums: off, hit, accent). M mutes a track, S plays it alone." : "Connect the FM-1 to see its tracks.";
  if (!st) return;
  for (const t of st.tracks) {
    const c = `var(--t${t.track})`, row = document.createElement("div"), steps = studio.raw[t.track - 1] || [];
    row.className = "trk";
    row.innerHTML = `<div class="tnum" style="background:${c}">${t.track}</div>
      <div class="tsound"><select class="snd" aria-label="Track ${t.track} sound"></select>
        <div class="tnums"><label>Loop <input type="number" class="loop" min="1" max="64"></label><label>Speed x<input type="number" class="speed" min="0.25" max="4" step="0.01"></label></div>
        <div class="tnums"><label>Echo <input type="range" class="echo" min="0" max="100"></label><label>Rev <input type="range" class="rev" min="0" max="100"></label></div></div><div class="grid"></div>
      <div class="tctl"><input type="range" class="vol" min="0" max="127" aria-label="Track ${t.track} volume"><button type="button" class="mute">M</button><button type="button" class="solo">S</button><button type="button" class="clr">Clear</button></div>`;
    fillSounds(row.querySelector(".snd"), t);
    const lp = row.querySelector(".loop"), sp = row.querySelector(".speed"), ec = row.querySelector(".echo"), rv = row.querySelector(".rev");
    lp.value = t.loop; sp.value = t.speed.toFixed(2); ec.value = t.echo ?? 0; rv.value = t.reverb ?? 0;
    lp.onchange = () => act("loop", () => studio.setTrack(t.track, { loop: +lp.value })).then(refresh);
    sp.onchange = () => act("speed", () => studio.setTrack(t.track, { speed: +sp.value })).then(refresh);
    ec.onchange = () => act("echo", () => studio.setTrack(t.track, { echo: +ec.value }));
    rv.onchange = () => act("rev", () => studio.setTrack(t.track, { reverb: +rv.value }));
    row.cells = [];
    const grid = row.querySelector(".grid"), n = Math.min(t.loop, steps.length);
    if (t.drum) {
      const used = LANE_LABEL.map((_, l) => steps.some((s) => drumCell(s, l).cls)), show = LANE_LABEL.map((_, l) => used[l] || l < 4 || row.dataset.all);
      LANE_LABEL.forEach((lab, l) => {
        const r = cellRow(t, n, (i) => drumCell(steps[i], l), (i, next) => editCell(t, i, next, l), lab);
        if (t.kit) { r.querySelector(":scope > .lanelab")?.remove(); r.prepend(kitCtl(t, l, lab)); r.classList.add("haskit"); }
        if (!show[l]) r.classList.add("spare");
        grid.append(r);
      });
      if (show.some((x) => !x)) {
        const more = document.createElement("button");
        more.type = "button"; more.className = "more"; more.textContent = "More drums";
        more.onclick = () => { grid.querySelectorAll(".spare").forEach((x) => x.classList.remove("spare")); more.remove(); };
        grid.append(more);
      }
    } else {
      grid.append(cellRow(t, n, (i) => melodicCell(steps, i), (i, next) => editCell(t, i, next, null)));
    }
    const vol = row.querySelector(".vol");
    vol.value = t.volume;
    vol.onchange = () => act("vol", () => studio.setTrack(t.track, { volume: +vol.value }));
    const m = row.querySelector(".mute"), s = row.querySelector(".solo");
    m.classList.toggle("on", t.muted); m.title = t.muted ? "Muted: press to hear it" : "Mute";
    m.onclick = () => act("mute", () => studio.setTrack(t.track, { muted: !t.muted })).then(refresh);
    s.classList.toggle("on", !!solo && solo.track === t.track); s.title = "Play this track alone";
    s.onclick = () => act("solo", () => setSolo(t.track)).then(refresh);
    row.querySelector(".clr").onclick = () => { if (confirm(`Clear track ${t.track}'s notes? (Hold SAVE on the FM-1 to undo.)`)) act("clear", () => studio.clearTrack(t.track)).then(refresh); };
    row.dataset.track = t.track;
    box.append(row);
  }
  drawHeads();
}
/* the sound picker: every engine's sounds, grouped */
let soundList = null;
function fillSounds(sel, t) {
  const cur = document.createElement("option");
  cur.textContent = `${t.sound} (${t.engine})`; cur.value = ""; cur.selected = true;
  sel.append(cur);
  const fill = (list) => {
    for (const g of list) {
      const og = document.createElement("optgroup"); og.label = g.engine;
      for (const s of g.sounds) { const o = document.createElement("option"); o.value = `${g.engine}|${s}`; o.textContent = s; og.append(o); }
      sel.append(og);
    }
  };
  if (soundList) fill(soundList);
  else sel.onfocus = sel.onmousedown = () => { if (!soundList) serial(() => studio.allSounds()).then((l) => { soundList = l; if (sel.options.length < 2) fill(l); }); };
  sel.onchange = () => {
    if (!sel.value) return;
    const [engine, sound] = sel.value.split("|");
    act("sound", () => studio.setSound(t.track, sound, engine)).then(refresh).catch(() => {});
  };
}
/* the playhead: each track's step playing, asked of the FM-1 a few times a second while it plays */
let heads = null;
function drawHeads() {
  for (const row of $("tracks").children) {
    const k = +row.dataset.track - 1, step = heads && heads[k];
    row.querySelectorAll(".cell.ph").forEach((c) => c.classList.remove("ph"));
    if (step != null) row.querySelectorAll(`.cell[data-i="${step}"]`).forEach((c) => c.classList.add("ph"));
  }
}
let headBusy = false, wasPlaying = null;
setInterval(async () => {
  if (!studio.dev || headBusy || pending || document.hidden) return;
  headBusy = true;
  try {
    const r = await studio.playheads();
    heads = r.playing ? r.steps : null;
    if (wasPlaying !== r.playing) { wasPlaying = r.playing; $("playBtn").classList.toggle("go", !r.playing); }
    drawHeads();
  } catch (e) { /* busy or gone: next time */ }
  headBusy = false;
}, 150);
$("playBtn").onclick = () => act("play", () => studio.transport(1)).then(refresh);
$("stopBtn").onclick = () => { heads = null; drawHeads(); act("stop", () => studio.transport(2)).then(refresh); };
$("bpm").onchange = () => act("bpm", () => studio.setTempo(+$("bpm").value));
$("swing").onchange = () => act("swing", () => studio.setSwing(+$("swing").value));
$("refreshBtn").onclick = () => refresh();
$("echoTime").onchange = () => act("fx", () => studio.setFx({ echo_time: $("echoTime").value }));
$("echoFb").onchange = () => act("fx", () => studio.setFx({ echo_feedback: +$("echoFb").value }));
$("revSize").onchange = () => act("fx", () => studio.setFx({ reverb_size: +$("revSize").value }));

/* ---------------------------------------------------------------- sampler */
let actx = null;
const audio = () => actx || (actx = new AudioContext());
let peaks = null;                                   /* the loaded sound's min / max per 256 samples */
async function decode(buf) { return await new OfflineAudioContext(1, 1, 48000).decodeAudioData(buf); }
function loadBuffer(buf, name) {
  const n = buf.length, ch = buf.numberOfChannels, mix = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mix[i] += d[i] / ch; }
  const r = studio.setClip(mix, buf.sampleRate, name);
  view = null;
  if (typeof stopPlay === "function" && player) stopPlay();
  const nb = Math.ceil(n / 256);
  peaks = { lo: new Float32Array(nb), hi: new Float32Array(nb) };
  for (let k = 0; k < nb; k++) {
    let lo = 0, hi = 0;
    for (let i = k * 256, e = Math.min(n, i + 256); i < e; i++) { const v = mix[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    peaks.lo[k] = lo; peaks.hi[k] = hi;
  }
  const max = studio.maxSeconds($("quality").value);
  if (r.seconds > max) studio.trimClip(0, max);
  $("smpName").value = studio.clip.name;
  $("clipName").textContent = `${name} · ${r.seconds.toFixed(1)} s`;
  drawWave();
  return r;
}
async function loadFile(file) {
  status(`Reading ${file.name}…`);
  try { loadBuffer(await decode(await file.arrayBuffer()), file.name); status(`Loaded ${file.name}. Drag on the waveform to choose the passage.`); }
  catch (e) { status(`Couldn't read ${file.name}. Try MP3, M4A, WAV, FLAC, OGG or MP4.`, true); }
}
function loudness() {
  const c = studio.needClip(), hop = Math.round(c.sr / 2), out = [];
  for (let i = 0; i < c.raw.length; i += hop) {
    let s = 0; const e = Math.min(c.raw.length, i + hop);
    for (let j = i; j < e; j++) s += c.raw[j] * c.raw[j];
    out.push(Math.sqrt(s / Math.max(1, e - i)));
  }
  const m = Math.max(1e-9, ...out);
  return out.map((v) => Math.round(9 * v / m)).join("");
}
function clipInfo() {
  const c = studio.needClip();
  return { name: c.name, seconds: +(c.raw.length / c.sr).toFixed(2), selection: { start: +c.start.toFixed(2), end: +c.end.toFixed(2) },
    loudness_per_half_second: loudness(), slot_holds_seconds: Object.fromEntries(["high", "long", "longest"].map((q) => [q, +studio.maxSeconds(q).toFixed(1)])) };
}
$("openBtn").onclick = () => $("fileIn").click();
$("fileIn").onchange = (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ""; };
let dragDepth = 0;
addEventListener("dragenter", (e) => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; $("drop").hidden = false; } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("drop").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("drop").hidden = true; const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

/* microphone or a browser tab (desktop Chrome / Edge) */
let rec = null;
const android = /Android/i.test(navigator.userAgent);
if (android || !navigator.mediaDevices?.getDisplayMedia) $("tabBtn").hidden = true;
async function capture(kind) {
  if (rec) { rec.mr.stop(); return; }
  const btn = kind === "tab" ? $("tabBtn") : $("micBtn"), raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  let stream;
  try {
    stream = kind === "tab" ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: raw, systemAudio: "include" })
      : await navigator.mediaDevices.getUserMedia({ audio: raw });
  } catch (e) { status(kind === "tab" ? "Capture cancelled or blocked." : "The microphone is blocked or missing. Allow it for this page and try again.", true); return; }
  const at = stream.getAudioTracks();
  if (!at.length) { stream.getTracks().forEach((t) => t.stop()); status('No sound came through. Tick "Share tab audio" when choosing the tab.', true); return; }
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(new MediaStream(at), mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : {});
  const chunks = [], t0 = performance.now(), an = audio().createAnalyser();
  audio().createMediaStreamSource(new MediaStream(at)).connect(an);
  const fl = new Float32Array(an.fftSize);
  rec = { mr, raf: 0 };
  btn.textContent = "Stop recording"; btn.classList.add("rec");
  $("lvl").hidden = $("recTime").hidden = false;
  status(kind === "tab" ? "Recording the shared tab: play something there, then come back and stop." : "Recording the microphone…");
  const tick = () => {
    an.getFloatTimeDomainData(fl); let p = 0; for (const v of fl) p = Math.max(p, Math.abs(v));
    $("lvl").firstChild.style.width = Math.min(100, p * 140) + "%";
    $("recTime").textContent = ((performance.now() - t0) / 1000).toFixed(1) + " s";
    rec.raf = requestAnimationFrame(tick);
  };
  tick();
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = async () => {
    cancelAnimationFrame(rec.raf); stream.getTracks().forEach((t) => t.stop()); rec = null;
    btn.textContent = kind === "tab" ? "Capture tab audio" : "Record mic"; btn.classList.remove("rec");
    $("lvl").hidden = $("recTime").hidden = true;
    const blob = new Blob(chunks, { type: mr.mimeType });
    if (!blob.size) { status("Nothing was recorded.", true); return; }
    try { loadBuffer(await decode(await blob.arrayBuffer()), kind === "tab" ? "TAB" : "MIC"); status("Recording loaded. Drag on the waveform to choose the passage."); }
    catch (e) { status("The recording couldn't be read.", true); }
  };
  at[0].addEventListener("ended", () => mr.state !== "inactive" && mr.stop());
  mr.start(250);
}
$("micBtn").onclick = () => capture("mic");
$("tabBtn").onclick = () => capture("tab");

/* the waveform: drag to choose, drag an edge to adjust */
const cv = $("wave"), g = cv.getContext("2d");
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/* the view: the part of the sound the waveform shows, in seconds (zoom and scroll) */
let view = null;
function getView() {
  const c = studio.clip, dur = c.raw.length / c.sr;
  if (!view || view.b > dur + 1e-6) view = { a: 0, b: dur };
  return view;
}
function setView(a, b) {
  const c = studio.clip; if (!c) return;
  const dur = c.raw.length / c.sr, w = Math.max(Math.min(b - a, dur), Math.min(dur, 0.02));
  a = Math.max(0, Math.min(a, dur - w));
  view = { a, b: a + w };
  drawWave();
}
const fmtT = (s, step) => s >= 60 || step >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : step < 0.1 ? s.toFixed(2) : step < 1 ? s.toFixed(1) : s.toFixed(0);
function drawWave() {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const W = cv.width, H = cv.height, c = studio.clip;
  g.fillStyle = css("--bg"); g.fillRect(0, 0, W, H);
  for (const id of ["zIn", "zOut", "zSel", "zAll", "zPan"]) $(id).disabled = !c;
  if (!c || !peaks) { $("selTxt").textContent = "Open a file or record to start"; $("fitTxt").textContent = ""; return; }
  const dur = c.raw.length / c.sr, { a: va, b: vb } = getView(), span = vb - va;
  const X = (s) => (s - va) / span * W, xa = X(c.start), xb = X(c.end);
  const top = 16 * dpr, mid = top + (H - top) / 2, amp = (H - top) * 0.46;
  g.fillStyle = "rgba(38,96,214,.10)"; g.fillRect(xa, top, xb - xa, H - top);
  const spp = span * c.sr / W, nb = peaks.lo.length;   /* samples a pixel covers */
  for (let x = 0; x < W; x++) {
    const i0 = Math.floor((va + x / W * span) * c.sr), i1 = Math.max(i0 + 1, Math.floor((va + (x + 1) / W * span) * c.sr));
    let lo = 0, hi = 0;
    if (spp >= 256) {
      for (let k = Math.floor(i0 / 256), e = Math.min(nb, Math.ceil(i1 / 256)); k < e; k++) { lo = Math.min(lo, peaks.lo[k]); hi = Math.max(hi, peaks.hi[k]); }
    } else {
      for (let i = i0, e = Math.min(c.raw.length, i1 + 1); i < e; i++) { const v = c.raw[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const tx = va + (x + 0.5) / W * span;
    g.fillStyle = tx >= c.start && tx <= c.end ? css("--t5") : css("--line");
    g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
  }
  /* the time ruler */
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s / span * W >= 70 * dpr) || 600;
  g.fillStyle = css("--mid"); g.font = `${11 * dpr}px system-ui, sans-serif`; g.textBaseline = "top";
  for (let s = Math.ceil(va / step) * step; s <= vb; s += step) {
    const x = X(s); g.fillRect(x, 0, Math.max(1, dpr), 5 * dpr); g.fillText(fmtT(s, step), x + 3 * dpr, 2 * dpr);
  }
  g.fillStyle = css("--text"); g.fillRect(xa - 1.5 * dpr, top, 3 * dpr, H - top); g.fillRect(xb - 1.5 * dpr, top, 3 * dpr, H - top);
  const pp = typeof playPos === "function" ? playPos() : null;
  if (pp != null) { g.fillStyle = css("--t1") || "#e0475b"; g.fillRect(X(pp) - dpr, 0, 2 * dpr, H); }
  const len = c.end - c.start, max = studio.maxSeconds($("quality").value);
  $("selTxt").textContent = `${c.start.toFixed(2)} s to ${c.end.toFixed(2)} s · ${len.toFixed(2)} s chosen`;
  $("fitTxt").textContent = `${len.toFixed(1)} of ${max.toFixed(1)} s a slot holds`;
  $("fit").classList.toggle("over", len > max + 0.01);
  $("fit").firstChild.style.width = Math.min(100, len / max * 100) + "%";
  const zoomed = span < dur - 1e-6;
  $("zPan").hidden = !zoomed;
  if (zoomed && document.activeElement !== $("zPan")) $("zPan").value = String(Math.round(va / (dur - span) * 1000));
  $("zTxt").textContent = zoomed ? `Showing ${fmtT(va, span < 6 ? 0.01 : 1)} to ${fmtT(vb, span < 6 ? 0.01 : 1)} of ${fmtT(dur, 1)}` : "";
}
const tAt = (e) => { const r = cv.getBoundingClientRect(), { a, b } = getView(); return a + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (b - a); };
function zoomBy(f, at) {
  const { a, b } = getView(), c = at ?? (a + b) / 2;
  setView(c - (c - a) * f, c + (b - c) * f);
}
cv.addEventListener("wheel", (e) => {
  if (!studio.clip) return;
  e.preventDefault();
  const { a, b } = getView();
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const d = (e.shiftKey ? e.deltaY : e.deltaX) / cv.getBoundingClientRect().width * (b - a); setView(a + d, b + d); }
  else zoomBy(e.deltaY > 0 ? 1.25 : 0.8, tAt(e));
}, { passive: false });
$("zIn").onclick = () => zoomBy(0.5);
$("zOut").onclick = () => zoomBy(2);
$("zSel").onclick = () => { const c = studio.clip, pad = (c.end - c.start) * 0.08; setView(c.start - pad, c.end + pad); };
$("zAll").onclick = () => { view = null; drawWave(); };
$("zPan").oninput = () => { const c = studio.clip, dur = c.raw.length / c.sr, { a, b } = getView(), w = b - a, x = $("zPan").value / 1000 * (dur - w); setView(x, x + w); };
let drag = null;
const pts = new Map();   /* fingers on the waveform: two pinch to zoom */
let pinch = null;
/* the middle button held: drag the timeline along. Plain mouse events on the window as well as pointer events, as some
   Windows browsers hand the middle button to their own autoscroll instead */
let midPan = null;
cv.addEventListener("mousedown", (e) => {
  if (e.button !== 1 || !studio.clip) return;
  e.preventDefault(); e.stopPropagation();
  const { a, b } = getView();
  midPan = { x: e.clientX, a, b }; cv.style.cursor = "grabbing";
});
addEventListener("mousemove", (e) => {
  if (!midPan) return;
  if (!(e.buttons & 4)) { midPan = null; cv.style.cursor = ""; return; }
  const d = (midPan.x - e.clientX) / cv.getBoundingClientRect().width * (midPan.b - midPan.a);
  setView(midPan.a + d, midPan.b + d);
});
addEventListener("mouseup", (e) => { if (e.button === 1 && midPan) { midPan = null; cv.style.cursor = ""; } });
cv.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });
cv.onpointerdown = (e) => {
  const c = studio.clip; if (!c) return;
  if (e.button === 1) return;   /* the middle button: the mouse events above pan */
  pts.set(e.pointerId, e.clientX);
  if (pts.size === 2) { const [x1, x2] = [...pts.values()], { a, b } = getView(), r = cv.getBoundingClientRect(); pinch = { d: Math.abs(x2 - x1) || 1, a, b, c: a + ((x1 + x2) / 2 - r.left) / r.width * (b - a) }; drag = null; return; }
  const r = cv.getBoundingClientRect(), dur = c.raw.length / c.sr, { a: va, b: vb } = getView(), t = tAt(e), near = 10 / r.width * (vb - va);
  drag = Math.abs(t - c.start) < near ? { edge: "a" } : Math.abs(t - c.end) < near ? { edge: "b" }
    : t > c.start && t < c.end ? { move: t - c.start } : { from: t };   /* inside the passage: slide it along, same length */
  cv.setPointerCapture(e.pointerId);
  if (drag.from != null) studio.trimClip(t, Math.min(dur, t + 0.05));
};
cv.onpointermove = (e) => {
  const c = studio.clip; if (!c) return;
  if (pts.has(e.pointerId)) pts.set(e.pointerId, e.clientX);
  if (pinch && pts.size === 2) { const [x1, x2] = [...pts.values()], f = pinch.d / (Math.abs(x2 - x1) || 1); setView(pinch.c - (pinch.c - pinch.a) * f, pinch.c + (pinch.b - pinch.c) * f); return; }
  if (!drag) {   /* the pointer shows what a drag here would do */
    const t = tAt(e), { a, b } = getView(), near = 10 / cv.getBoundingClientRect().width * (b - a);
    cv.style.cursor = Math.abs(t - c.start) < near || Math.abs(t - c.end) < near ? "ew-resize" : t > c.start && t < c.end ? "grab" : "crosshair";
    return;
  }
  if (drag.pan != null) {
    const d = (drag.pan - e.clientX) / cv.getBoundingClientRect().width * (drag.b - drag.a);
    setView(drag.a + d, drag.b + d);
    return;
  }
  const t = tAt(e);
  try {
    if (drag.move != null) { const len = c.end - c.start, dur = c.raw.length / c.sr, s = Math.max(0, Math.min(dur - len, t - drag.move)); studio.trimClip(s, s + len); }
    else if (drag.edge === "a") studio.trimClip(Math.min(t, c.end - 0.02), c.end);
    else if (drag.edge === "b") studio.trimClip(c.start, Math.max(t, c.start + 0.02));
    else studio.trimClip(Math.min(drag.from, t), Math.max(drag.from, t) + 0.0001);
  } catch (err) { /* too short while dragging */ }
};
cv.onpointerup = cv.onpointercancel = (e) => {
  pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
  const changed = drag && drag.pan == null;
  drag = null;
  if (changed && player && player.kind === "preview") startPlay("preview").catch((err) => status(err.message, true));   /* hear the new passage */
};
addEventListener("resize", drawWave);
$("quality").onchange = drawWave;

/* listening: Play runs the whole sound from what's in view, Preview only the chosen passage as the FM-1 will get it;
   Loop repeats either; a line follows the sound on the waveform; Space starts and stops Play */
let player = null;     /* {src, t0, kind, a, b, rev}: a..b the stretch it plays (seconds), from t0 (the audio clock) */
let fullBuf = null, fullFor = null;
function stopPlay() {
  if (player) { player.src.onended = null; try { player.src.stop(); } catch (e) {} player = null; }
  $("playSmp").textContent = "Play"; $("previewBtn").textContent = "Preview";
  document.querySelectorAll(".lib .lp.on").forEach((b) => { b.textContent = "▶"; b.classList.remove("on"); });
  drawWave();
}
function playPos() {
  if (!player || player.kind === "file") return null;
  const len = player.b - player.a, el = audio().currentTime - player.t0;
  const p = $("loopSmp").checked ? ((el % len) + len) % len : Math.min(el, len);
  return player.rev ? player.b - p : player.a + p;
}
function tick() {
  if (!player || player.kind === "file") return;
  const pos = playPos(), v = getView();
  if (player.kind === "play" && (pos > v.b || pos < v.a)) { const w = v.b - v.a; setView(pos - w * 0.05, pos + w * 0.95); }   /* follow it */
  else drawWave();
  requestAnimationFrame(tick);
}
async function startPlay(kind) {
  const c = studio.clip; if (!c) return;
  stopPlay();
  const ctx = audio(), src = ctx.createBufferSource(), loop = $("loopSmp").checked;
  let a, b, rev = false;
  if (kind === "play") {
    if (fullFor !== c) {
      fullBuf = ctx.createBuffer(1, c.raw.length, c.sr); fullBuf.copyToChannel(c.raw, 0); fullFor = c;
    }
    const dur = c.raw.length / c.sr, v = getView();
    a = v.b - v.a < dur - 1e-6 ? v.a : 0; b = dur;   /* zoomed in: from the start of what's in view */
    src.buffer = fullBuf;
    if (loop) { src.loop = true; src.loopStart = a; src.loopEnd = b; }
  } else {
    const rate = { high: 22050, long: 11025, longest: 8000 }[$("quality").value];
    rev = $("rev").checked;
    const s16 = studio.clipSamples(rate, { reverse: rev }), f = Float32Array.from(s16, (x) => x / 32768);
    const buf = ctx.createBuffer(1, f.length, rate); buf.copyToChannel(f, 0);
    src.buffer = buf; src.loop = loop; a = c.start; b = c.end;
  }
  src.connect(ctx.destination);
  src.onended = () => { if (player && player.src === src) stopPlay(); };
  await ctx.resume();
  src.start(0, kind === "play" ? a : 0);
  player = { src, t0: ctx.currentTime, kind, a, b, rev };
  $(kind === "play" ? "playSmp" : "previewBtn").textContent = kind === "play" ? "Stop" : "Stop preview";
  requestAnimationFrame(tick);
}
$("playSmp").onclick = () => (player && player.kind === "play" ? stopPlay() : startPlay("play").catch((e) => status(e.message, true)));
$("previewBtn").onclick = () => (player && player.kind === "preview" ? stopPlay() : startPlay("preview").catch((e) => status(e.message, true)));
$("loopSmp").onchange = () => { if (player) startPlay(player.kind); };
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  const el = e.target, tag = el && el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !/^(checkbox|range|radio|button)$/.test(el.type)) || el.isContentEditable) return;
  if (!studio.clip) return;
  e.preventDefault();
  $("playSmp").click();
});
async function sendSample(slot, opt) {
  $("prog").firstChild.style.width = "0";
  const msg = await studio.sendSample(slot, { ...opt, progress: (p) => { $("prog").firstChild.style.width = p * 100 + "%"; } });
  if (TOKEN) saveToLibrary(opt.name).catch(() => {});   /* kept in My samples too */
  return msg;
}
$("sendBtn").onclick = async () => {
  const slot = +$("slot").value, trk = $("useTrk").value;
  await act("send", async () => {
    const m = await sendSample(slot, { name: $("smpName").value, quality: $("quality").value, reverse: $("rev").checked });
    return trk ? m + ". " + await studio.useSample(+trk, slot) : m;
  }).then(refresh).catch(() => {});
};
function wavBytes(s, rate) {
  const b = new ArrayBuffer(44 + s.length * 2), v = new DataView(b), w = (o, x) => [...x].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + s.length * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, s.length * 2, true);
  for (let i = 0; i < s.length; i++) v.setInt16(44 + i * 2, s[i], true);
  return new Uint8Array(b);
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
/* the chosen passage at the sound's own rate (faded, normalised, reversed if ticked) into Music\Coracle Samples */
async function saveToLibrary(name) {
  if (!TOKEN) throw new Error("Saving needs Coracle Studio on the PC");
  const c = studio.needClip(), rate = Math.min(c.sr, 48000);
  const r = await api("/api/save_sample", { name: name || $("smpName").value || "SAMPLE", wav: b64(wavBytes(studio.clipSamples(rate, { reverse: $("rev").checked }), rate)) });
  loadLibrary();
  return r.result;
}
$("saveBtn").onclick = () => saveToLibrary().then((r) => { status(`Saved ${r.name} in My samples.`); log(`Saved ${r.name}`); }, (e) => status(e.message, true));

/* ---------------------------------------------------------------- my samples: every sample sent or saved, newest first */
const libCache = new Map();   /* path → decoded sound */
let libAll = false;
async function libSound(s) {
  const k = s.path + "|" + s.t;
  if (!libCache.has(k)) {
    const r = await fetch(`/media?token=${TOKEN}&path=${encodeURIComponent(s.path)}`);
    if (!r.ok) throw new Error(`Couldn't open ${s.file}`);
    libCache.set(k, await decode(await r.arrayBuffer()));
  }
  return libCache.get(k);
}
async function libPlay(s, btn) {
  const was = player && player.kind === "file" && player.path === s.path;
  stopPlay();
  if (was) return;
  const buf = await libSound(s), ctx = audio(), src = ctx.createBufferSource();
  src.buffer = buf; src.loop = $("loopSmp").checked; src.connect(ctx.destination);
  src.onended = () => { if (player && player.src === src) stopPlay(); };
  await ctx.resume(); src.start();
  player = { src, t0: ctx.currentTime, kind: "file", path: s.path, a: 0, b: buf.duration };
  btn.textContent = "■"; btn.classList.add("on");
}
async function loadLibrary() {
  const box = $("libList");
  if (!TOKEN) { box.innerHTML = '<p class="hint">My samples needs Coracle Studio on the PC.</p>'; return; }
  let r;
  try { r = (await api("/api/list_samples", {})).result; } catch (e) { box.textContent = e.message; return; }
  box.replaceChildren();
  $("libCount").textContent = r.samples.length ? `${r.samples.length} in ${r.folder}` : "";
  if (!r.samples.length) { box.innerHTML = '<p class="hint">Nothing yet. Every sample you send to the FM-1 or save lands here.</p>'; return; }
  const list = libAll ? r.samples : r.samples.slice(0, 12);
  for (const s of list) {
    const row = document.createElement("div"); row.className = "lib";
    row.innerHTML = `<button type="button" class="lp" title="Listen">▶</button><span class="ln"></span><span class="lt"></span><span class="lw"></span>
      <button type="button" class="ll" title="Put it in the sampler above, to trim or send">Load</button><button type="button" class="lx" title="Take it off the list (it goes to the Removed folder)">✕</button>`;
    row.querySelector(".ln").textContent = s.name.replace(/ \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d( \(\d+\))?$/, "") || s.name;
    row.querySelector(".ln").title = s.file;
    row.querySelector(".lt").textContent = s.seconds != null ? `${s.seconds.toFixed(1)} s` : "";
    row.querySelector(".lw").textContent = s.when;
    const pb = row.querySelector(".lp");
    pb.onclick = () => libPlay(s, pb).catch((e) => status(e.message, true));
    row.querySelector(".ll").onclick = async () => {
      try {
        stopPlay();
        loadBuffer(await libSound(s), s.name);
        $("smpName").value = s.name.replace(/ \d{4}-\d\d-\d\d.*$/, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 8) || "SAMPLE";
        status(`${s.name} is in the sampler.`);
      } catch (e) { status(e.message, true); }
    };
    row.querySelector(".lx").onclick = () => api("/api/remove_sample", { path: s.path }).then(loadLibrary, (e) => status(e.message, true));
    box.append(row);
  }
  if (r.samples.length > 12) {
    const more = document.createElement("button"); more.type = "button"; more.className = "more";
    more.textContent = libAll ? "Show fewer" : `Show all ${r.samples.length}`;
    more.onclick = () => { libAll = !libAll; loadLibrary(); };
    box.append(more);
  }
}
$("libOpen").onclick = () => api("/api/open_samples", {}).catch((e) => status(e.message, true));
$("libRefresh").onclick = () => loadLibrary();
loadLibrary();

/* ---------------------------------------------------------------- commands (Claude, other programs, the console) */
const COMMANDS = {
  async get_state(a) { await connect(true).catch(() => {}); if (!studio.dev) return { connected: false, note: "No FM-1 connected: it needs to be plugged into this PC by USB and switched on." }; lastState = await studio.state({ steps: a.steps !== false }); render(lastState); return lastState; },
  async connect() { const i = await connect(); return `Connected: ${i.version}`; },
  list_sounds: (a) => studio.listSounds(a.engine),
  set_sound: (a) => studio.setSound(a.track, a.sound, a.engine),
  set_steps: (a) => studio.setSteps(a.track, a.steps),
  set_drums: (a) => studio.setDrums(a.track, a.lanes),
  set_track: (a) => studio.setTrack(a.track, a),
  clear_track: (a) => studio.clearTrack(a.track),
  set_tempo: (a) => studio.setTempo(a.bpm),
  set_swing: (a) => studio.setSwing(a.percent),
  set_fx: (a) => studio.setFx(a),
  play: () => studio.transport(1),
  stop: () => { heads = null; drawHeads(); return studio.transport(2); },
  async find_media(a) { return (await api("/api/find_media", { folder: a.folder || "" })).result; },
  async load_audio(a) {
    if (!TOKEN) throw new Error("Loading files by path needs Coracle Studio on the PC");
    const r = await fetch(`/media?token=${TOKEN}&path=${encodeURIComponent(a.path)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn't open ${a.path}`);
    loadBuffer(await decode(await r.arrayBuffer()), a.path.split(/[\\/]/).pop());
    return clipInfo();
  },
  audio_info: () => clipInfo(),
  trim_audio(a) { const r = studio.trimClip(a.start, a.end); drawWave(); return { ...r, slot_holds_seconds: clipInfo().slot_holds_seconds }; },
  send_sample(a) {
    if (a.quality) $("quality").value = a.quality;
    if (a.name) $("smpName").value = String(a.name).toUpperCase().slice(0, 8);
    $("slot").value = String(a.slot); $("rev").checked = !!a.reverse; drawWave();
    return sendSample(a.slot, a);
  },
  use_sample: (a) => studio.useSample(a.track, a.slot),
  set_kit: (a) => studio.setKit(a.track, a.parts),
  set_song: (a) => studio.setSong(a.track, a.parts, a.variants || {}),
  song_mode: (a) => studio.songMode(a.mode),
  get_song: () => studio.songState(),
  async save_sample(a) { const r = await saveToLibrary(a.name); return `Saved ${r.name} in My samples`; },
  async list_samples() { return (await api("/api/list_samples", {})).result; },
};
const NO_DEVICE = new Set(["find_media", "load_audio", "audio_info", "trim_audio", "connect", "get_state", "save_sample", "list_samples"]);
async function exec(cmd, args = {}, by = "you") {
  const f = COMMANDS[cmd];
  if (!f) throw new Error(`Unknown command ${cmd}`);
  if (!NO_DEVICE.has(cmd) && !studio.dev) await connect(true).catch(() => { throw new Error("The FM-1 isn't connected: plug it into this PC by USB and switch it on."); });
  const run = () => f(args || {});
  const r = cmd === "get_state" || cmd === "connect" ? await run() : await serial(run);
  if (cmd !== "get_state" && cmd !== "audio_info") { log(`${by === "claude" ? "Claude: " : ""}${typeof r === "string" ? r : cmd}`); if (typeof r === "string") status(r); }
  if (/^(set_|clear_|play|stop|use_sample|send_sample|song_mode)/.test(cmd) && cmd !== "set_fx") refresh();
  return r;
}
window.coracle = { exec: (c, a) => exec(c, a, "script"), studio };
if (TOKEN) {
  const es = new EventSource(`/events?token=${TOKEN}`);
  es.onmessage = async (ev) => {
    const m = JSON.parse(ev.data);
    let payload;
    try { payload = { ok: true, result: await exec(m.cmd, m.args || {}, "claude") }; }
    catch (e) { payload = { ok: false, error: e.message }; status(e.message, true); }
    api("/api/result", { id: m.id, payload }).catch(() => {});
  };
}

/* ---------------------------------------------------------------- start */
studio.changed("init");
drawWave();
if (MOCK) status("Simulated FM-1 (?mock): nothing reaches a real one.");
connect(true).catch(() => status(MOCK ? "" : "Plug in the FM-1 (USB data cable) and press Connect."));
