# M1 測試結果（M1_TEST_RESULTS.md）

執行時間：2026-11-05 17:10–17:20（GMT+8）· 依據 M0_TEST_PLAN.md

## A. 部署測試
| 用例 | 結果 | 證據 |
|---|---|---|
| T1.1 前端版本標記 | ✅ 通過 | 線上返回 `AMCM 指引通 v3.1`；law-article-title×2、readmodes×6、briefCacheKey×4、skelCards×3、footnote-ref×4 |
| T1.2 Worker 版本 | ✅ 通過 | Version `3963eed4`，cron `0 23 * * *` |
| T1.3 本地=線上 | ✅ 通過 | 均為 54,573 字節 |

## B. API 及資料測試
| 用例 | 結果 | 證據 |
|---|---|---|
| T2.1 stats | ✅ 通過 | guidelines=170（含 15 真新指引）、superseded=40、pages=3617、news=20 |
| T2.2 詳情首頁 | ✅ 通過 | id=1 zh_TW 排序後 page_number=1 存在 |
| T2.3 效力鏈 | ✅ 通過 | `superseded_by=doc_number` 行數 = 0 |
| T2.5 中文搜索（雲端） | ✅ 通過（附註） | total=31，命中正常；**附註**：10 條結果去重後 (gid,page) 僅 5 個——locale 重複展示仍存在（M0 BUG#7，M2 範圍） |
| T2.6 英文搜索（liquidity） | ✅ 通過 | total=67 |
| T2.7 頁碼連續性 | ✅ 通過 | 全庫 gap 組數 = 0 |

## C. 閱讀器測試（瀏覽器交互）
**測試能力聲明：本環境無瀏覽器自動化權限，C 組無法實機執行。以下區分證據等級，不以靜態審查冒充實測。**

| 用例 | 狀態 | 已有的最強證據 |
|---|---|---|
| T3.1 第一頁顯示 | ⚠️ 靜態驗證 | 線上為 v3.1 連續模式，`pagesOf()` 排序後 `pages[0]`（=page_number 1）起渲染；API 證實 P1 存在。**滾動定位未實測** |
| T3.2 連續閱讀 | ❓ 未實測 | 代碼：全部頁面拼接 + 頁碼分隔線；JS 語法通過 |
| T3.3 按頁閱讀 | ❓ 未實測 | 同上（flip/pagenav 邏輯審查） |
| T3.4 頁碼跳轉 | ❌ 未實現 | M0 BUG#8，屬 M1 範圍外（Roadmap M1 未含，M2 計劃） |
| T3.5 搜索定位高亮 | ❓ 未實測 | locateHighlight/highlightIn 代碼審查；API 搜索正常 |
| T3.6 法規排版 | ❓ 未實測 | renderLawHtml 正則（第X條/（一）/[n]腳註）代碼審查 + CSS 存在 |
| T3.7 響應式 | ❓ 未實測 | media query 640px 存在 |

**需要的權限**：瀏覽器自動化（如 Playwright MCP / 瀏覽器控制開關）或人工按 M0_TEST_PLAN §3 步驟驗收。

## D. 數據寫入類用例（按審計原則未執行）
- T5.x 郵件訂閱/退訂、T6.x（部分已在 Cron 回歸中完成 R1/R2 兩輪，見 M1_CRON_FIX_REPORT §2）：added=0 幂等 ✅、自我取代=0 ✅、無新重複 ✅。

## 匯總
- 通過（有直接證據）：T1.1–T1.3、T2.1–T2.3、T2.5–T2.7、Cron 幂等與數據斷言 → **10 項**
- 未實測（缺瀏覽器權限）：T3.1–T3.3、T3.5–T3.7 → **6 項**（其中 5 項有代碼級+API 級旁證）
- 未實現（計劃內 M2）：T3.4 → 1 項
