# M2 — 任務計劃 v2（修訂版，待人工批准後執行）

> v2 修訂依據 M1.6 審核意見：正文完整性定義（T1）、清洗原始文本與 Diff 保留（T2）、
> 搜索去重細則與 total 口徑（T3）、14 組重複僅列明不自動處理（T4）、真實路徑核對（T6）。
> v1（`M2_TASK_PLAN.md`）保留作歷史記錄，以本文件為準。

前置條件：M1.6 四份文件人工審核通過；Worker 納入 Git 方案（M1.6_WORKER_GIT_PLAN.md）批准並執行（T6 前置）。
開工第一步：preM2 備份已完成（M1.6 Phase 2），直接進入任務。

執行順序：T1 → T2 → T3 → T4 → T5 → T6（T6 可與 T4/T5 並行，須待 Git 方案落地）。

---

## 路徑定義（v2 新增，全計劃統一）

| 路徑 | 角色 |
|---|---|
| `E:/RichAPP/richapps/` | 主倉庫（前端、文檔、報告；Git 管理） |
| `E:/RichAPP/richapps/worker/amcm-api/` | Worker 源碼（待 Git 方案批准後成為唯一源碼位） |
| `E:/RichAPP/amcm-worker/` | 舊 Worker 目錄 + 全部 D1 備份（backups/ 不入 Git） |
| `E:/RichAPP/amcm-etl/` | ETL 腳本與本地真值庫 `amcm.db`（不入 Git；secrets.env 絕不入 Git） |
| `richapps/amcm/index.html` | 前端**源文件**（唯一編輯入口） |
| `richapps/public/amcm/index.html` | **部署副本**（每次改動後由源文件複製同步，`diff -q` 必須為空才可部署）——M0 P0 缺陷即源於兩者失同步，此為強制流程 |

## T1：15 條新指引正文抽取及補齊無文本資料

- **內容**：id156–170 下載 PDF → 文本抽取（原生/OCR 分流）→ 機翻缺失語種 → 導入本地 ETL → 增量導出 D1；同時補齊 7 份保險中介類無文本指引。
- **無文本定義（v2 修訂）**：`guidelines g` 無任何**非空正文** chunk（`content IS NOT NULL AND TRIM(content)!=''` 且長度 ≥ 50 字符），而非僅查 chunks 行是否存在。空殼行不算有文本。
- **標記區分（v2 修訂）**：`is_ocr`（頁面來自 OCR）、原生抽取（無標記）、`is_machine_translated`（機翻）三者嚴格互斥標記；**機翻文本一律保留 `is_machine_translated=1` 並在前端展示「機器翻譯」標識，絕不寫入原文欄位或標記為官方原文**。
- **修改文件**：`amcm-etl/`（extract/ocr/translate 復用 + 新增 `extract_new.py`）、`export_d1.py`。
- **影響生產 D1**：是（INSERT 新 chunks / UPDATE 缺失欄位；禁改既有文本）。
- **備份**：已有 preM2；導入前再做受影響 guideline_id 專項快照。
- **Dry-run**：`--dry-run` 列出待抽取文件、頁數、分流判定（原生/OCR）清單；先跑 1 份全流程人工確認再批量。
- **驗收標準**：按 v2 定義的無文本數 = 0；新增頁碼連續；OCR 頁均分 ≥0.75；機翻頁 100% 帶 `is_machine_translated=1`；D1 stats pages 數 = chunks 行數。
- **回滾**：preM2/專項快照恢復受影響 guideline_id 的 chunks 行。

## T2：chunks 頁眉、頁腳及重複內容清洗

- **內容**：數據層清洗（前端規則下沉）：頁碼行 / 機構名頁眉 / 連續重複行 / `傳閱文件` 標記。
- **v2 修訂**：
  - **原始文本不可丟**：本地 ETL 另建 `chunks_original` 表（或 content_prev 欄位）保留清洗前原文，清洗僅作用於生產 content，且**每條修改記錄 Diff**（舊值/新值/規則命中原因）存 `clean_diff.jsonl`；
  - **防誤刪**：白名單規則僅命中確定性模式（`第 X 頁/共 Y 頁`、`Page X of Y`、純頁碼行等）；規則命中即刪除超過單份文件正文 5% 的，該文件中止並人工復核；
  - **先 Dry-run 抽查 10 份**：輸出 diff 報告（每份刪行數+前 20 條刪除樣本），人工逐份確認無正文誤刪後才回寫 D1。
- **修改文件**：`amcm-etl/clean_chunks.py`（新增）、`export_d1.py`。
- **影響生產 D1**：是（UPDATE chunks.content，逐 id 白名單）。
- **備份**：清洗前 `chunks-preclean-<date>.sql` + 本地原文表（雙保險）。
- **Dry-run**：如上，10 份人工確認為硬性閘門。
- **驗收標準**：確定性頁眉/頁碼模式在 D1 = 0；同頁完全重複 = 0；抽 10 份前端閱讀器逐段比對原文無內容缺失；FTS rebuild 後搜索命中正常。
- **回滾**：pre-clean 備份或 chunks_original 表恢復受影響行。

## T3：搜索結果按 (gid, page) 去重

- **v2 修訂**：
  - 同一 `guideline_id + page_number` 多 locale 命中 → **優先保留 `zh_TW` 的有效正文行**（content 非空、非純頁眉）；無 zh_TW 時按 `zh_CN` → `en` → `pt` 順序回落；
  - **`total` 按去重後行數計算**（不是 FTS 原始命中數），與 `data` 長度一致；
  - 返回體保留 `locales` 數組標示該頁可用語種。
- **修改文件**：`worker/amcm-api/src/index.js`（search 路由）。
- **影響生產 D1**：否。**備份**：否（Worker rollback 即回滾）。
- **Dry-run**：本地 `wrangler dev` 對 5 中文 + 5 英文關鍵詞輸出修改前後對照表（命中數、total、去重效果）。
- **驗收標準**：任一結果 (gid,page) 無重複；`total` == `data.length`；中英搜索均正常命中。
- **回滾**：`wrangler rollback` 至前一 Version ID。

## T4：ETL 14 組同鍵重複治理

- **v2 修訂（強化）**：**僅產出 14 組明細表**（每組：全部 id / sector / 標題 / 文號 / 年份 / status / chunks 數 / 各自 PDF 連結 / 官方樹對應節點）並逐組給出建議動作（合併/保留並標註官方多條目），**等待人工逐組批准。不得自動刪除或合併任何行**。
- **修改文件**：`amcm-etl/`（清點腳本）+ 明細報告；執行階段另議。
- **影響生產 D1**：本階段否（僅只讀清點）；獲批准後的執行階段是。
- **備份**：執行階段前受影響行專項快照。
- **Dry-run**：明細表本身即 Dry-run。
- **驗收標準**：明細表 14 組完整、建議動作有依據（官方樹截圖/連結佐證）；人工批准後執行結果滿足「同鍵重複僅剩豁免項、無 chunks 孤兒」。
- **回滾**：專項快照恢復。

## T5：唯一索引評估及資料遷移方案

- **內容**（與 v1 相同）：T4 完成後評估 `UNIQUE(sector, title_norm, doc_number)` 部分索引可行性，產出方案文檔（衝突預檢 SQL、DDL、回滾 DROP）。**M2 僅產文檔不建索引。**
- 修改文件：`docs/M2_UNIQUE_INDEX_PROPOSAL.md`。影響 D1：否。備份：否。
- Dry-run：方案附只讀衝突預檢。驗收：方案含衝突證據/豁免清單/DDL/回滾語句，批准後排入 M3。回滾：不適用。

## T6：閱讀器頁碼跳轉及體驗完善

- **v2 修訂（路徑核對）**：已核對真實路徑——源文件 `richapps/amcm/index.html` 與部署副本 `richapps/public/amcm/index.html`（當前兩者一致，M1 T1.3 驗證）。**改動只進源文件，隨後複製同步並 `diff -q` 校驗為空，再部署 Pages**；部署後線上字節數必須與本地副本一致（M1 同法）。
- **內容**：按頁模式「跳至第 N 頁」輸入框（連續模式定位對應頁）；搜索定位精確滾動；返回列表記憶位置。
- 修改文件：`richapps/amcm/index.html`（源）→ 同步 `public/amcm/index.html`。影響 D1：否。備份：否（Git 回滾）。
- Dry-run：`new Function` JS 語法校驗 + 本地打開檢查。
- 驗收標準：輸入頁碼跳轉正確、兩模式均可用、手機可用；**補驗 T3.4 通過**；線上字節 = 本地。
- 回滾：`git revert` + 重新部署。

## 執行紀律（延續 M1/M1.6）

- 每任務：備份/快照 → dry-run → 人工確認閘門（T1 批量前、T2 十份抽查、T4 逐組批准）→ 執行 → 驗收斷言 → 報告。
- 產出 `M2_<任務>_REPORT.md`，含修改前後對照與測試證據。
- 全程嚴格限制：不動 preM1 備份；secrets.env / amcm.db / backups/ 永不入 Git。
