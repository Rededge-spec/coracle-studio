# Coracle Studio

The M-VAVE FM-1 running the CORACLE firmware, from a browser: its six tracks, tempo and swing, play and stop,
and a sampler that records or loads a sound, trims it and sends it to a user slot (USR1-3).

**Open it:** https://rededge-spec.github.io/coracle-studio/

On an Android tablet: connect the FM-1 with a USB OTG adapter, open the address above in Chrome or Opera,
tap Connect and allow MIDI. Without an FM-1, add `?mock` to the address for a simulated one.

On the PC, Coracle Studio also runs locally (with Claude's commands and the My samples library); this page is
the same front end without the PC parts.

GPL-3.0 (LICENSE). The FM-1 protocol code (`proto.js`) is from Skiff's web editor (Leo Kuroshita / Hügelton
Instruments and the Skiff authors). Fonts: Barlow Condensed and Inter Tight (SIL OFL, `fonts/`).
