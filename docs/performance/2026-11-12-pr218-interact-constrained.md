# PR #218 interact-constrained investigation, 2026-11-12

**Status: closed.** No streaming or typing regression remained after 387c896a.
The one real cost was the modal + menu, which PR #219 made `modal={false}`.

After PR #218 (merged as 00141133), the paired responsiveness gate failed on
`interact-constrained`. That scenario is signed-in, mobile viewport, 4x CPU and
the constrained network profile.

## Paired CI evidence

Two paired runs measured the same product code: 689dc798 only changed a doc
after ad7bbf54. Their head-versus-base deltas point in opposite directions.
Values are milliseconds, `n` is samples across 5 runs, IQR is the 25th to 75th
percentile.

| Metric | Run 43151554816 (ad7bbf54), base / head | Run 43155444794 (689dc798), base / head | Pooled, base / head |
| --- | --- | --- | --- |
| `typingToFrameEarlyMs` | 30 (26-45) / 36 (33-42), n=40 | 32 (29-61) / 30 (27-37), n=40 | 32 (28-53) / 34 (29-41), n=80 |
| `deltaToContentFrameEarlyMs` | 60 (48-75) / 71 (57-89), n≈340 | 69 (53-85) / 61 (49-76), n≈344 | 64 (51-81) / 66 (52-84), n=686 |
| `menuToFrameEarlyMs` | 292 (222-314) / 322 (250-347), n=5 | 342 (224-360) / 268 (266-330), n=5 | 297 (225-343) / 288 (266-343), n=10 |
| `typingToFrameLateMs` | 46 (38-110) / 70 (51-195), n=40 | 60 (50-162) / 50 (39-123), n=40 | 54 (42-146) / 57 (45-163), n=80 |
| `deltaToContentFrameLateMs` | 111 (95-139) / 154 (117-203), n≈78 | 135 (108-167) / 121 (100-148), n≈78 | 123 (100-153) / 131 (105-180), n≈155 |
| `menuToFrameLateMs` | 241 (206-338) / 172 (161-353), n=5 | 148 (141-238) / 280 (194-367), n=5 | 206 (147-299) / 241 (166-340), n=10 |

The base arm alone moved 46 to 60 ms on late typing between runs. Pooled late
medians sit 3 to 35 ms higher on head, inside overlapping IQRs, and early
metrics are flat. Whole-run totals flipped the same way: TBT 4174 to 6258 ms in
the first run, 5748 to 4340 ms in the second. The earlier real regression, run
43147187011 (`typingToFrameLateMs` 53 to 127 ms), was the `:has()` reveal on
the turn group, fixed in 387c896a.

## Local attribution

Scratch production builds of the merge base (d533123a) and head, with source
maps, `next start` and the deterministic provider. Headless Chrome, 390x844,
4x CPU.

- **Guest stream, one send per arm**, 20 s trace with typing bursts: main-thread
  task time 18.5 s base vs 18.4 s head, layout 2.05 vs 2.02 s, paint 1.07 vs
  0.99 s, style 0.41 vs 0.40 s. Parity.
- **Count probe** (`bench:counts`, guest, desktop width, 3 runs at 1x and 4x,
  identical every run), head as shipped vs head with `modal={false}`:
  `composer-menu-open` measured 7 vs 3 layouts and 16 vs 12 style recalcs, with
  17 React commits either way. The extra work is Base UI's modal scroll lock:
  it flips `<html>` overflow and reads layout on open and on close.
- **Menu open and close mid-stream** (about 60k characters rendered, one sample
  each): modal open 119 ms, close 99 ms; `modal={false}` open 101 ms, close
  84 ms. The modal run did 5 more forced layouts at about 3.5 ms each.
  Containment keeps each forced layout small.

## Notes for the next investigation

- Before chasing an `interact-constrained` timing failure, check a second paired
  run on the same code and compare the per-run `ui` samples, not one p50.
- Off Vercel every local guest shares one network bucket, so the guest cap is
  5 sends a day for all local runs. `bench:counts` never sends.
