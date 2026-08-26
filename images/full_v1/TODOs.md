# elab2arc full video — v1 merge plan

Concatenates `images/intro_v2/elab2arc_intro_v2_final.mp4` (the "why" — reworked to hand
off forward, not to "content below") with `images/tutorial_v6/elab2arc_tutorial_v6_final.mp4`
(the "how" — title scene cut as duplicative, login/Tokens screen picks up where intro's
new scene 4 hands off to) into one continuous video. Does not touch either source file.

## Pre-merge checks

- [x] Confirmed both inputs share the exact same spec before attempting the join:
      1280x720, h264 High profile, yuv420p, 30fps; aac LC, mono, 24000Hz. No conversion
      needed on either side.
- [x] Narrator continuity: both pieces use `af_heart` at speed 1.08 (intro_v2's pick,
      reused deliberately for tutorial_v6 — see both TODOs.md's Findings sections). One
      voice throughout the merged video.
- [x] Content continuity already verified in each piece's own build: intro_v2 scene 4
      says "Let's see it in action — a real walkthrough, starting now" over a mockup of
      the Tokens screen; tutorial_v6 opens directly on that same Tokens screen with
      "Start with a one-click login link...". No title-scene re-introduction in between
      (cut from tutorial_v6 for duplicating intro's own pitch — see that TODOs.md).

## Build

- [x] Concat via `filter_complex concat` + single full re-encode (not `-c copy` stream-copy
      concat) — a plain stream-copy join produced a non-monotonic DTS warning when
      tutorial_v6's own two pieces (footage + closing) were joined this same way; a full
      re-encode avoided it there and is used again here for the same reason, even though
      both inputs already share identical encode parameters (the two files still have
      independent timestamp/GOP histories from separate ffmpeg runs).
- [x] Confirm final spec matches target exactly.

## QA

- [x] Frame-extract right at the seam (end of intro / start of tutorial) — confirm no
      visual glitch, no dead air or audio overlap in the crossover.
- [x] volumedetect across the full merged file — confirm no clipping.
- [x] Full duration sanity check: should equal intro duration + tutorial duration exactly
      (no frames dropped or duplicated at the join).

## Result

**Final file:** `elab2arc_full_v1.mp4` — 99.68s (intro 34.67s + tutorial 64.98s, matching
within one frame), 1280x720, h264/yuv420p 30fps, aac mono 24000Hz. Audio: max -4.8dB (no
clipping), mean -27.5dB.

Confirmed clean at the seam by frame extraction: t=34.4s still shows intro's scene 4
handoff ("Let's see it in action — a real walkthrough, starting now" + forward arrow);
t=34.9s (0.23s into the tutorial half) already shows the real app footage. No visual
glitch, no dead-air gap, no audio overlap at the join.

---

## Addendum (2026-08-26) — re-merged after tutorial_v6's new opening scene

`tutorial_v6` gained a new ~8s "easier access" QR/link scene at its start (see its
TODOs.md addendum). Re-ran the same concat process against the updated
`elab2arc_tutorial_v6_final.mp4` — no changes needed to the merge process itself, same
full re-encode approach as before.

**New final file:** `elab2arc_full_v1.mp4` — 107.61s (intro 34.67s + tutorial 72.91s,
matching within rounding), 1280x720, h264/yuv420p 30fps, aac mono 24000Hz. Audio: max
-4.8dB, mean -27.4dB, no clipping.

Confirmed clean at both seams by frame extraction: the intro→tutorial seam (now landing
on the new access scene, t=35.0s shows it mid-entrance-fade, t=42.5s shows it fully
settled — both expected, no glitch) and the access→footage seam within tutorial_v6
itself (already verified in that TODOs.md). Final frame at t=107.2s confirms the closing
card holds correctly through to the end.
