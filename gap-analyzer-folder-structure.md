# Gap Analyzer — Folder Structure

## Pre-Run: scan folder → images + URL

Pick a folder. The app scans it and looks for:

1. **Image files** — jpg, png, webp, etc. (any names)
2. **Amazon URL** — in **any** `.txt` file in that folder

Both found → one plan is created. Folder name can be anything (`Gentle Foaming Hand Soap`, not `B0…`).

```
ClientEngagement/
  Gentle Foaming Hand Soap/
    Hero.jpg
    A+ Module 1.jpg
    listing-notes.txt          ← URL anywhere in this file
```

**Optional:** copy-spec spreadsheet, `product-data.json`

**Run** needs each plan to have **URL + at least one image**. Copy-spec is not required.

## Image comparison (future)

Vision LLM compares planned vs live images — **not** by matching filenames.

## `captures/` (live only during Run)

Playwright writes here; names are internal. Not related to planned asset names.

## Supabase

Persistent storage for planned assets and live captures after Run.
