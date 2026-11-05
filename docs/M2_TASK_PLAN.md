# M2 — 任務計劃（待人工批准後執行）

前置條件：M1.5 五份文件人工審核通過；T3 人工點驗完成（或明確豁免）。
開工第一步（批准後）：執行一次 `preM2` 逐表 D1 備份（彌補 M1.5 報告指出的備份缺口）。

執行順序即依賴順序：T1 → T2 → T3 → T4 → T5 → T6（T6 可與 T4/T5 並行）。

---

## T1：15 條新指引正文抽取及補齊無文本資料

- **內容**：對 M1 自動補入的 id156–170（官方新增，含 019/2025-AMCM 等）下載 PDF → 文本抽取（原生/OCR 分流）→ 機翻缺失語種 → 導入本地 ETL 庫 → 增量導出至 D1。同時處理 M0 發現的 7 份無文本指引（保險中介類）。
- **修改文件**：`amcm-etl/`（新增 `extract_new.py` 或復用 fetch_laws_v2/extract_text/ocr_scanned/translate_missing）、`amcm-etl/export_d1.py`。
- **影響生產 D1**：是（僅 INSERT 新 chunks/UPDATE 缺失欄位，禁 UPDATE 既有文本）。
- **需要備份**：是——preM2 備份（尤其 chunks 表）。
- **Dry-run**：`--dry-run` 模式列出待抽取文件清單與預計頁數，不寫庫；先跑 1 份全流程人工確認再批量。
- **驗收標準**：無文本指引數 = 0（`SELECT COUNT(*) FROM guidelines g WHERE NOT EXISTS(...chunks)`）；新增 chunks 頁碼連續（無 gap）；OCR 頁均分 ≥0.75；D1 stats 的 pages 數與 chunks 行數一致。
- **回滾**：從 preM2 chunks 備份恢復被影響 guideline_id 的行（`DELETE ... WHERE guideline_id IN (...)` + 重放備份對應 INSERT）；guidelines 表本次不動。

## T2：chunks 頁眉、頁腳及重複內容清洗

- **內容**：清洗規則（已在前端實現，此為**數據層根治**）：`Page X of Y` / 頁碼行 / 機構名頁眉 / 連續重複行 / `傳閱文件` 類標記 → 在 ETL 中處理後增量回寫 D1（僅 UPDATE content）。
- **修改文件**：`amcm-etl/clean_chunks.py`（新增）、`amcm-etl/export_d1.py`。
- **影響生產 D1**：是（UPDATE chunks.content，逐 id 白名單式）。
- **需要備份**：是——清洗前導出 `chunks-preclean-<date>.sql`，且本地 ETL 保留原始未清洗文本（origin 欄位或旁表，確保可逆）。
- **Dry-run**：清洗腳本輸出 diff 報告（每份指引：刪行數、刪除內容樣本前 20 條），人工抽查 10 份無誤傷（正文行不得被誤刪）後才回寫。
- **驗收標準**：`Page X of Y` 樣式行在 D1 中 = 0；同頁完全重複內容 = 0；抽 10 份比對前端閱讀器無內容缺失；FTS 重建後搜索命中正常。
- **回滾**：以 pre-clean 備份恢復受影響行；或依本地原始文本重算回寫。

## T3：搜索結果按 (gid, page) 去重

- **內容**：`/api/search` 同一指引同一頁因多 locale 行重複命中 → SQL 層 GROUP BY (guideline_id, page_number) 聚合，locale 標記保留其一（優先 zh_TW）。
- **修改文件**：`amcm-worker/src/index.js`（僅 search 路由）。
- **影響生產 D1**：否（純查詢邏輯）。
- **需要備份**：否（Worker 部署可秒級回滾，舊 Version ID 保留）。
- **Dry-run**：本地 `wrangler dev` + 對比測試：修改前後對同一組關鍵詞（中文 5 個、英文 5 個）輸出結果數對照表。
- **驗收標準**：任一搜索結果中 (gid,page) 無重複；total 計數與去重後行數一致。
- **回滾**：`wrangler rollback` 至前一 Version ID。

## T4：ETL 14 組同鍵重複治理

- **內容**：M1 終驗發現的 14 組 (sector,title_tc,doc_number) 重複（均為 ETL 原有，new_n=0）→ 逐組判定：合併版本行（保留各自 chunks 對應關係）或標註為官方樹多條目。**逐組人工確認清單後才執行**。
- **修改文件**：`amcm-etl/`（治理腳本）+ 治理報告；生產 D1 同步。
- **影響生產 D1**：是（合併行會刪除/重指向 guidelines 行與其 chunks）。
- **需要備份**：是——preM2 備份 + 治理前受影響行專項快照。
- **Dry-run**：先產出 14 組明細表（id/標題/文號/chunks 數/PDF 連結），逐組給出建議動作，**等人工確認清單**。
- **驗收標準**：`GROUP BY sector,title_tc,doc_number HAVING c>1` 僅剩人工豁免項（有正當理由的官方多條目）；無 chunks 孤兒。
- **回滾**：專項快照恢復受影響 guidelines/chunks 行。

## T5：唯一索引評估及資料遷移方案

- **內容**：在 T4 完成後，評估 `UNIQUE(sector, title_norm, doc_number)` 部分索引（僅 doc_number 非空行）的可行性，產出遷移方案文檔（含衝突預檢 SQL、索引 DDL、回滾 DROP 語句）。**本任務只產出方案，不在 M2 執行建索引。**
- **修改文件**：`docs/M2_UNIQUE_INDEX_PROPOSAL.md`（新增）。
- **影響生產 D1**：否（M2 階段僅文檔）。
- **需要備份**：否。
- **Dry-run**：方案中附衝突預檢查詢（在生產只讀執行）。
- **驗收標準**：方案含：衝突數=0 的證據（或豁免清單）、索引 DDL、預期失敗場景、回滾語句；人工批准後方可排入 M3。
- **回滾**：不適用（未執行）。

## T6：閱讀器頁碼跳轉及體驗完善

- **內容**：按頁模式頂部加「跳至第 N 頁」輸入框（連續模式定位到對應頁）；搜尋定位改用頁碼精確滾動；小體驗：返回列表記憶位置。
- **修改文件**：`richapps/amcm/index.html` + 同步 `public/amcm/index.html`（部署）。
- **影響生產 D1**：否。
- **需要備份**：否（Git 即回滾手段）。
- **Dry-run**：本地靜態打開 + wrangler pages dev 或手動檢查 JS 語法（`new Function` 校驗，M1 同法）。
- **驗收標準**：輸入頁碼可跳轉且高亮該頁分隔線；連續/按頁兩模式均可用；手機端輸入框可用；補驗 T3.4 通過。
- **回滾**：`git revert` + 重新部署 Pages。

## 執行紀律（延續 M1）

- 每項任務：備份先行 → dry-run → 人工確認點（T1 批量前、T2 回寫前、T4 清單確認）→ 執行 → 驗收斷言 → 報告。
- 產出：`M2_TASK_REPORT.md`（或按任務分文件），含修改前後對照與測試證據。
- 額外建議（非本計劃項）：將 `amcm-worker/` 納入 Git 版本控制。
