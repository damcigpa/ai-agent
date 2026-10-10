# Retrieval eval — voyage-4

2026-10-09 · 12 notes · 22 answerable questions + 4 the library does not answer · top 5

## Chunk size comparison

| Chunk size / overlap | Chunks | Hit@1 | Recall@3 | Recall@5 | MRR@5 | Right file in top 5 |
|---|---|---|---|---|---|---|
| 400 / 50 | 39 | 82% | 95% | 100% | 0.890 | 100% |
| 800 / 100 (current) | 20 | 95% | 100% | 100% | 0.970 | 100% |
| 1500 / 150 | 12 | 95% | 100% | 100% | 0.977 | 100% |

## By question type (chunk size 800)

| Type | Questions | Hit@1 | Recall@5 | MRR@5 |
|---|---|---|---|---|
| direct | 5 | 100% | 100% | 1.000 |
| paraphrase | 7 | 86% | 100% | 0.905 |
| cross-language | 4 | 100% | 100% | 1.000 |
| distractor | 6 | 100% | 100% | 1.000 |

## Not ranked first (chunk size 800)

- **Melyik költő írt mesés történetet egy árva fiúról, aki bejárja a világot?** (paraphrase) — rank 3; first hit: arany_janos.txt

## Can a distance threshold detect "no relevant material"? (chunk size 800)

- Right passages were found at distance 0.652 – 1.391
- For questions the library does not answer, the closest chunk was at 1.047 – 1.631
- The ranges overlap: no single distance cut-off separates "relevant" from "nothing relevant". This is why the app lets a model (judgeMaterial) decide coverage instead of a threshold.
