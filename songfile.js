/* SPDX-License-Identifier: GPL-3.0-only
 * Coracle Studio: Save song / Open song. The FM-1 keeps a song in several parts: the live song (object 0), the four
 * saved project slots (2..5), the pattern bank the projects' notes live in (16..31) and the user samples (32..34).
 * A song file holds all of them, in the "felucca-backup" format (so the full FM-1 backups made before open too).
 * Opening one writes those parts back; the FM-1's settings (1) and user sound presets (6..9) stay as they are.
 * Adapted from Skiff's web/fm1backup.js (Copyright (C) 2026 Leo Kuroshita (@kurogedelic), Hügelton Instruments). */
"use strict";
(function () {
  const BANK_IDS = Array.from({ length: 16 }, (_, i) => 16 + i);
  const BACKUP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...BANK_IDS, 32, 33, 34];
  const BACKUP_IDS_V3 = BACKUP_IDS.filter((id) => id < 16 || id >= 32);
  const BACKUP_IDS_V2 = BACKUP_IDS_V3.filter((id) => id !== 9);
  const BACKUP_IDS_V1 = BACKUP_IDS_V2.filter((id) => id !== 8);
  const idsOf = (n) => [BACKUP_IDS, BACKUP_IDS_V3, BACKUP_IDS_V2, BACKUP_IDS_V1].find((ids) => ids.length === n) || null;
  const BK = { LIST: 65, GET: 66, PUT: 67 }, CHUNK = 256;
  const SONG_IDS = [0, 2, 3, 4, 5, ...BANK_IDS, 32, 33, 34];   /* what Open song writes back */
  const bkU32 = (n) => Array.from({ length: 5 }, (_, i) => (n >>> (i * 7)) & (i === 4 ? 15 : 127));
  const bkR32 = (a, off = 0) => {
    if (a.length < off + 5 || a[off + 4] > 15) throw new Error("Invalid song file number");
    return (a[off] | a[off + 1] << 7 | a[off + 2] << 14 | a[off + 3] << 21 | a[off + 4] << 28) >>> 0;
  };
  function bkPack(bytes) {
    const a = [];
    for (let off = 0; off < bytes.length; off += 7) {
      const chunk = bytes.subarray(off, off + 7);
      a.push(chunk.reduce((m, b, i) => m | (b >>> 7) << i, 0), ...chunk.map((b) => b & 127));
    }
    return a;
  }
  function bkUnpack(a, size) {
    const out = new Uint8Array(size); let i = 0, j = 0;
    while (j < size) {
      const n = Math.min(7, size - j), mask = a[i++];
      if (mask == null || mask >>> n) throw new Error("Invalid song bytes");
      for (let k = 0; k < n; k++) {
        if (a[i] == null || a[i] > 127) throw new Error("Short song chunk");
        out[j++] = a[i++] | (mask >>> k & 1) << 7;
      }
    }
    if (i !== a.length) throw new Error("Trailing song bytes");
    return out;
  }
  function bkCrc(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0); }
    return (~c) >>> 0;
  }
  function bkCheck(rc) {
    if (rc) throw new Error(({ 1: "the FM-1 doesn't take that part", 2: "the FM-1 found the file's data wrong", 3: "stop playback first", 4: "the FM-1 couldn't write its memory", 5: "start again" })[rc] || `the FM-1 said ${rc}`);
  }
  function bkManifest(a) {
    if (a[0] !== 1) throw new Error("This firmware can't save songs to a file");
    bkCheck(a[1]);
    const ids = idsOf(a[2]);
    if (!ids || a.length !== 3 + a[2] * 11) throw new Error("The FM-1's list of parts came back incomplete");
    return ids.map((id, i) => {
      const p = 3 + i * 11;
      if (a[p] !== id) throw new Error("Unexpected part from the FM-1");
      const size = bkR32(a, p + 1), crc = bkR32(a, p + 6);
      if (size > (id >= 32 ? 81920 : 3840) || (!size && crc)) throw new Error("A part is too large");
      return { id, size, crc };
    });
  }
  const b64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
  function readSong(file) {
    if (typeof file === "string") file = JSON.parse(file);
    const ids = file && Array.isArray(file.objects) ? idsOf(file.objects.length) : null;
    if (!file || file.format !== "felucca-backup" || file.version !== 1 || !ids) throw new Error("That isn't a Coracle song file");
    const objects = file.objects.map((o, i) => {
      if (!o || o.id !== ids[i] || !Number.isInteger(o.size) || o.size < 0 || o.size > (o.id >= 32 ? 81920 : 3840) ||
          !Number.isInteger(o.crc) || o.crc < 0 || o.crc > 0xffffffff || typeof o.data !== "string" ||
          o.data.length !== 4 * Math.ceil(o.size / 3)) throw new Error("The song file is damaged");
      const bytes = Uint8Array.from(atob(o.data), (c) => c.charCodeAt(0));
      if (bytes.length !== o.size || bkCrc(bytes) !== o.crc) throw new Error("The song file is damaged (checksum)");
      if (o.id >= 32 && o.size) {
        if (o.size < 512) throw new Error("A sample in the file is too short");
        const view = new DataView(bytes.buffer), length = view.getUint32(16, true), count = bytes[6];
        if (view.getUint32(0, true) !== 0x504d5346 || view.getUint16(4, true) !== 1 || !count || count > 16 ||
            length !== o.size - 512 || bkCrc(bytes.subarray(512)) !== view.getUint32(20, true)) throw new Error("A sample in the file is damaged");
      }
      return { ...o, bytes };
    });
    if (!objects[0].size) throw new Error("The song file has no song in it");
    return { ...file, objects };
  }
  async function capture(request, firmware, name, onProgress = () => {}) {
    const manifest = bkManifest(await request([BK.LIST, []], { timeout: 3000, retries: 0 }));
    const objects = [], total = manifest.reduce((n, o) => n + o.size, 0); let done = 0;
    for (const o of manifest) {
      const bytes = new Uint8Array(o.size);
      for (let off = 0; off < o.size; off += CHUNK) {
        const size = Math.min(CHUNK, o.size - off);
        const a = await request([BK.GET, [o.id, ...bkU32(off), size & 127, size >>> 7]], { timeout: 1000, retries: 1 });
        bkCheck(a[1]);
        if (a[0] !== o.id || bkR32(a, 2) !== off || (a[7] | a[8] << 7) !== size) throw new Error("Unexpected reply from the FM-1");
        bytes.set(bkUnpack(a.slice(9), size), off);
        done += size; onProgress(done, total);
      }
      if (bkCrc(bytes) !== o.crc) throw new Error("The FM-1 changed while saving. Stop it and try again.");
      objects.push({ ...o, data: b64(bytes) });
    }
    const file = { format: "felucca-backup", version: 1, app: "Coracle Studio", name, firmware, created: new Date().toISOString(), objects };
    readSong(file); return file;
  }
  async function restore(request, file, onProgress = () => {}) {
    const song = readSong(file);   /* every byte checked before the first write */
    const pick = (o) => SONG_IDS.includes(o.id);
    const total = song.objects.filter(pick).reduce((n, o) => n + o.size, 0); let done = 0;
    const ask = async (r, o = {}) => request(r, { timeout: 4000, retries: 0, ...o });
    const put = async (args) => { const a = await ask([BK.PUT, args]); bkCheck(a[2]); return a; };
    for (const o of [...song.objects.slice(2), song.objects[0]].filter(pick)) {   /* the live song last */
      if (o.id >= 32) {
        const slot = o.id - 32;
        const check = (a) => { if (a[0] !== slot) throw new Error("Unexpected sample reply"); bkCheck(a.at(-1)); };
        if (!o.size) check(await ask([14, [slot]]));
        else {
          check(await ask([11, [slot]]));
          for (let off = 512; off < o.size; off += CHUNK) {
            const chunk = o.bytes.subarray(off, off + CHUNK);
            check(await ask([12, [slot, off & 127, off >>> 7 & 127, off >>> 14 & 127, ...bkPack(chunk)]]));
            done += chunk.length; onProgress(done, total);
          }
          check(await ask([13, [slot, ...bkPack(o.bytes.subarray(0, 480))]]));
          done += 512; onProgress(done, total);
        }
      } else {
        if (BANK_IDS.includes(o.id)) {   /* firmware without the pattern bank refuses these (nothing written): skip */
          const a = await ask([BK.PUT, [0, o.id, ...bkU32(o.size), ...bkU32(o.crc)]]);
          if (a[2] === 1) { done += o.size; onProgress(done, total); continue; }
          bkCheck(a[2]);
        } else await put([0, o.id, ...bkU32(o.size), ...bkU32(o.crc)]);
        try {
          for (let off = 0; off < o.size; off += CHUNK) {
            const chunk = o.bytes.subarray(off, off + CHUNK);
            await put([1, o.id, ...bkU32(off), ...bkPack(chunk)]);
            done += chunk.length; onProgress(done, total);
          }
          await put([2, o.id]);
        } catch (e) { await put([3, o.id]).catch(() => {}); throw e; }
      }
    }
    return song;
  }
  /* one object's bytes (e.g. 32..34: a user sample slot, its 512-byte header and IMA ADPCM data) */
  async function readObject(request, id, onProgress = () => {}) {
    const o = bkManifest(await request([BK.LIST, []], { timeout: 3000, retries: 0 })).find((x) => x.id === id);
    if (!o) throw new Error("The FM-1 doesn't list that part");
    const bytes = new Uint8Array(o.size);
    for (let off = 0; off < o.size; off += CHUNK) {
      const size = Math.min(CHUNK, o.size - off);
      const a = await request([BK.GET, [o.id, ...bkU32(off), size & 127, size >>> 7]], { timeout: 1000, retries: 1 });
      bkCheck(a[1]);
      if (a[0] !== o.id || bkR32(a, 2) !== off || (a[7] | a[8] << 7) !== size) throw new Error("Unexpected reply from the FM-1");
      bytes.set(bkUnpack(a.slice(9), size), off);
      onProgress(off + size, o.size);
    }
    if (bkCrc(bytes) !== o.crc) throw new Error("The FM-1 changed while reading. Stop it and try again.");
    return bytes;
  }
  /* a user slot's bytes -> its sounds as {sr, x: Float32Array} (IMA ADPCM, low nibble first, each sound from 0, 0) */
  function decodeSlot(bytes) {
    if (bytes.length < 512) throw new Error("That slot is empty");
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = bytes[6], out = [];
    const name = String.fromCharCode(...bytes.subarray(8, 16)).replace(/\0.*$/, "").trim();
    for (let z = 0; z < count; z++) {
      const b = 32 + z * 28, off = v.getUint32(b, true), n = v.getUint32(b + 4, true), rate = v.getUint32(b + 16, true);
      const x = new Float32Array(n), d = bytes.subarray(512 + off);
      let pred = 0, idx = 0;
      for (let i = 0; i < n; i++) {
        const code = (d[i >> 1] >> ((i & 1) * 4)) & 15, step = IMA_STEP[idx];
        let vd = step >> 3;
        if (code & 4) vd += step; if (code & 2) vd += step >> 1; if (code & 1) vd += step >> 2;
        pred = Math.max(-32768, Math.min(32767, code & 8 ? pred - vd : pred + vd));
        idx = Math.max(0, Math.min(88, idx + IMA_IDX[code & 7]));
        x[i] = pred / 32768;
      }
      out.push({ sr: Math.round(rate * 44100 / 65536), x });
    }
    return { name, sounds: out };
  }
  window.coracleSong = { capture, restore, readSong, readObject, decodeSlot };
})();
