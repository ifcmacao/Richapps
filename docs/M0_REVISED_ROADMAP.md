# M0 修訂路線圖（M0_REVISED_ROADMAP.md）

原則：先修 P0 → 再補核心缺失 → 最後擴展。每個里程碑有可驗收產物；**M0 整改不動生產數據結構，僅 UPDATE 數據 + 部署代碼。**

## M1（第 1 週）：止血與上線 —— 消除 P0
1. **部署 v3.1 前端**（BUG#1）：同步 `amcm/index.html` → `public/amcm/`，部署，線上標記驗證（`law-article-title` 存在）。
2. **修復 Cron upsert 鍵**（BUG#2）：唯一鍵改為 `sector + norm(title) + doc_number`（無編號回落 norm(title)+category）；效力鏈推導排除同編號組；部署前 `wrangler d1 export` 備份。
3. **數據回寫**（BUG#2）：從本地 ETL 真值 UPDATE id14（002/2013-AMCM, SUPERSEDED→026/2025）、id15（IN_FORCE, superseded_by=NULL）。
4. **驗收**：D1 復查兩行正確；Cron 手動觸發一次無新增污染；線上 v3.1 標記存在。

## M2（第 2-3 週）：文本質量與數據完整性
1. ETL 一次性清洗腳本（BUG#4）：頁眉/頁腳/頁碼行剝離 + 重複行摺疊，僅 UPDATE chunks.content；同時重建 FTS（字節分批法）。先在本地全量 dry-run 輸出 diff 報告人工抽檢，再執行 D1 導入。
2. 補齊 7 份無文本指引（BUG#3）：排查官網 translations 樹的 pdf 掛載位置；有 PDF → 走完整 ETL；無 PDF → 標註「僅官網鏈接」。
3. 版本實體治理（BUG#5）：同 doc_number 合併展示（前端 group），versions 關係入庫。
4. 搜索去重（BUG#7）：API 按 (gid,page) 去重。
5. PDF 頁數比對基準（DATA_REPORT §3）：以 pdf_processing.total_pages 建立頁數斷言。
6. 驗收：無文本指引=0；抽查 10 份無頁眉殘留；頁數斷言全綠。

## M3（第 4-6 週）：AI 深化與自動化閉環
1. 腳註獨立表 `guideline_footnotes`（v3.1 §2.1 未完成項）+ 前端 Hover 卡片。
2. 新 PDF 自動化（BUG#6）：Cron 發現新 PDF → chunks 置 pending → 本機定時 ETL 拉取隊列（或評估 Workers + 第三方 OCR 的付費方案，屆時另行決策）。
3. 監管百科詞條自動超連結（v3.1 §8）：高頻術語表 + 前端自動鏈接到檢索頁。
4. OCR 雙引擎共識（v3.1 §2.2）：第二 OCR 引擎 + LLM 仲裁，僅對 needs_review 的 222 頁。
5. 郵件端到端驗證 + 摘要模板升級（含新指引摘要段）。
6. 驗收：儀表板 5 區塊全部可生成；腳註可懸停；一封真實摘要郵件送達任意郵箱。

## M4（第 7-10 週）：平台化
1. PWA 推送（Web Push）對新指引/新聞做站內提醒（此前降級項目）。
2. Cron 可觀測性（BUG#13）：sync 明細表 + 失敗告警郵件。
3. 效能：guidelines 列表接口分頁默認 size 收緊、FTS 查詢緩存。
4. 商店材料重啟準備（AAB 已有；截圖/隱私清單/分級問卷）。
5. 憑據全面輪換（BUG#14）後歸檔。

## 風險與依賴
- D1 修改均需先 export 備份；
- 憑據輪換（用戶側）建議在 M1 同步完成；
- M3 第 4 項 OCR 仲裁產生 LLM 費用（DeepSeek，量小可控）。
