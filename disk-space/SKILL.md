---
name: disk-space
description: 'Find what fills a disk or folder; use for "disk full", "what takes space", "biggest files".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

Find or clone <https://github.com/PFalkowski/DiskSpaceAnalyzer>, then run:

`dotnet run -c Release --project <clone>/DiskSpaceAnalyzer -- "<path>" --top 20`

Without `--top` it opens an interactive explorer; agents cannot drive it.
