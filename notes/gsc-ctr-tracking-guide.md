# GSC CTR Tracking Guide

## Purpose
Track query CTR and average position after title/description updates.

## Recommended cadence
- Weekly check: same 7-day window comparison
- Monthly check: 28-day vs previous 28-day comparison

## Target pages
- https://pixieed.jp/
- https://pixieed.jp/tools.html
- https://pixieed.jp/projects/pixiedraw/

## How to use
1. Copy `notes/gsc-ctr-tracking-template.csv` to a new dated file.
2. Fill clicks, impressions, CTR, and average position from GSC.
3. Set `priority` to `high` when impressions are high and CTR is low.
4. Add one concrete `next_action` per row.
5. Review again on `next_check_date`.

## Priority rule (simple)
- `high`: impressions >= 100 and ctr_percent < 8
- `mid`: impressions >= 30 and ctr_percent < 8
- `low`: all others
