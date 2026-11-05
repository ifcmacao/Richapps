# M1 部署報告（M1_DEPLOYMENT_REPORT.md）

執行時間：2026-11-05 17:05–17:10（GMT+8）· Git commit：`1d4eb38`（main，已推送 origin）

## 1. 修改文件清單
| 文件 | 變更 |
|---|---|
| `amcm-worker/src/index.js` | Cron upsert 匹配鍵重構 + 效力鏈保守推導 + batch 原子寫入（見 M1_CRON_FIX_REPORT） |
| `amcm/index.html` → `public/amcm/index.html` | **同步**（此前脫節），diff 為零 |
| `docs/M0_*.md` ×6、`docs/M1_*.md` ×5 | 審計與整改報告入庫 |
| `amcm-worker/backups/*` | D1 備份、修復 SQL、誤插行備份（不部署） |

## 2. 部署動作與版本
| 組件 | 命令 | 最終版本 |
|---|---|---|
| Worker | `wrangler deploy`（迭代 7 次直至回歸全綠） | `3963eed4-b585-4b26-9d09-6115bc60ea73` |
| Pages | `wrangler pages deploy public --project-name=richapps --branch=main` | 44bd7846（Uploaded 1 file） |
| Cron | 部署時自動註冊 | `0 23 * * *` 不變 |

## 3. 部署前靜態檢查（全部通過）
- `diff -q amcm/index.html public/amcm/index.html` → 一致
- JS 語法：`new Function(script)` 解析通過；CSS 花括號平衡
- v3.1 特徵標記：law-article-title/law-subarticle/footnote-ref/readmodes/briefCacheKey/skelCards 全部存在
- API 路徑硬編碼正確（amcm-api.ifcmacao.workers.dev）
- Worker：`node --check` 通過

## 4. 部署後線上驗證（非僅命令成功）
- 線上 HTML 字節數 54,573 = 本地文件 ✅
- 線上標記 `AMCM 指引通 v3.1` ✅（部署前為 v2.1，已確認切換）
- /api/stats 返回 guidelines=170 ✅
