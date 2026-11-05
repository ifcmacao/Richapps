# M0 缺陷清單（M0_BUG_REGISTER.md）

分級：P0 影響原文完整性/錯誤展示/AI 重大錯誤結論 ｜ P1 核心不可用/數據錯誤 ｜ P2 體驗/效能 ｜ P3 視覺
狀態標註：【已確認】有直接證據｜【高度懷疑】有旁證待復現｜【尚未驗證】

| # | 級別 | 缺陷 | 狀態 | 證據 | 影響 | 修復方案（建議，M1 執行） |
|---|---|---|---|---|---|---|
| 1 | **P0** | v3.1 前端未部署：`amcm/index.html`（v3.1, 54KB）未同步至部署目錄 `public/amcm/index.html`（v2.1, 40KB），線上仍為 v2.1 | 【已確認】 | 線上 HTML 無 `law-article-title/readmodes/briefCacheKey` 標記；兩檔大小時間戳對比 | v3.1 全部前端成果（排版/儀表板/雙閱讀模式/骨架屏）用戶不可見 | M1 第一步：同步文件→`wrangler pages deploy`→線上標記驗證 |
| 2 | **P0** | Cron upsert 以 `sector+title_tc` 為鍵，同標題不同版本互相覆寫：D1 中 id=14 的 doc_number 由 `002/2013-AMCM` 被覆寫為 `026/2025-AMCM`，id=14/15 雙雙 SUPERSEDED 且 superseded_by 指向自身編號 | 【已確認】 | D1 SQL 抽查 vs 本地 amcm.db（id14 仍為 002/2013、id15 IN_FORCE）；兩行 `superseded_by = doc_number = 026/2025-AMCM` | 官方版本鏈展示錯誤；用戶可能把 2013 版當 2025 版；AI RAG 檢索到錯誤元數據 | M1：為 upsert 增加唯一鍵 `sector+norm(title)+doc_number`；修復 id14/15（從本地 ETL 重導出該兩行）；效力鏈推導排除「同編號」分組 |
| 3 | **P1** | 7 份指引無任何文本（id 133,134,135,141,142,143,144，保險中介人 CPD/准照類） | 【已確認】 | D1 NOT EXISTS 查詢；其 pdf_tc 均為空 | 搜索/閱讀器對這些文檔為空殼 | 排查官網樹結構：pdf 掛在 translations 的哪個 locale；補抓 PDF→ETL 全流程；確無 PDF 的標註「僅官網鏈接」 |
| 4 | **P1** | chunks 內殘留頁眉/頁腳/頁碼與重複行（`Page X of Y`、`1/19`、`傳閱文件×4`） | 【已確認】 | id1 p1、id13 en p1-2、id20 p1 原文截圖式證據 | 閱讀體驗差；FTS 命中頁眉噪音；AI 上下文被重複行浪費 token | ETL 側清洗重導入（一次性腳本，僅 UPDATE 不重建）；前端 v3.1 清洗引擎已寫好，上線後展示層即時緩解 |
| 5 | **P1** | 同編號多版本條目無治理：`004/B/2026-DSB` 在庫 3 行 | 【已確認】 | 本地 DB GROUP BY 查詢 | 列表出現 3 張同號卡片；效力鏈混亂 | 數據層面定義「版本實體」：同 doc_number 合併為一條，版本差異入 versions 子表 |
| 6 | **P1** | 新指引 PDF 的文本抽取/OCR 無自動化，Cron 只同步元數據 | 【已確認】 | Worker syncGuidelines 不產 chunks | 新指引上線後「查看內文」為空，需人工跑 ETL | M2：Cron 命中新 PDF 時推送通知/置 pending 標記 + 本機定時 ETL 或接受半自動 |
| 7 | **P2** | 搜索結果重複：同 gid+page 多 locale 近重複命中重複展示（gid129「雲端」p4 兩條相同摘要） | 【已確認】 | /api/search 實測輸出 | 檢索體驗混亂，點擊結果可能跳到同一頁 | API 層 GROUP BY gid,page 取 rank 最優行，或前端按 (gid,page) 去重 |
| 8 | **P2** | 按頁模式無頁碼直接跳轉輸入框 | 【已確認】 | v3.1 代碼 pagenav 僅前後翻頁 | 長文檔（38頁）導航低效 | M1 加入頁碼輸入/下拉 |
| 9 | **P2** | email_subscribers 存在 2 條未確認測試數據 | 【已確認】 | D1 統計 total=2 confirmed=0 | 無實害；確認郵件重發邏輯未驗證 | E7 端到端實測後清理 |
| 10 | **P2** | FTS 中文 snippet 空白異常寬（逐字索引致 mark 內全形空格） | 【已確認】 | 「雲端」命中 snippet `雲 端` 空格分離 | 閱讀觀感 | 前端渲染時 collapse 空格，或 snippet 生成後去除 CJK 間空格 |
| 11 | **P2** | 多份指引缺 en 語言（id13/60/120/140/155 等僅 2 語言） | 【已確認】 | D1 GROUP_CONCAT(locales) | 非缺陷本身（官網無英文版），但閱讀器語言欄應標註「官網未提供」 | 前端 localebar 缺失語言加灰置提示；AI 回答已做機翻免責 |
| 12 | **P3** | 機器翻譯來源標記粒度為頁級且部分為整份機翻（id13 zh_TW 全 38 頁 mt） | 【已確認】 | mt_pages=154 分佈 | 用戶對「哪句是機翻」不直觀 | M3：段級標註或全文機翻徽章提升到文檔級 |
| 13 | **P3** | Workers 無日誌保留，Cron 失敗不可追溯 | 【已確認】 | 無 logpush 配置 | 靜默失敗風險 | M2：Cron 結果寫入 sync_state 明細表 + Worker Analytics 告警 |
| 14 | **P0 風險**（運維） | 對話中曾暴露多個 API Token/Key（GitHub PAT、CF Token、Resend/DeepSeek Key） | 【已確認】 | 會話記錄 | 憑據洩露風險 | 人工輪換全部憑據；此為用戶側待辦 |

## 修復順序建議
1 → 2 → 4 → 3 → 5 → 7 → 8 → 6 → 其餘隨迭代。
（#1 上線後 #4 前端緩解；#2 修復需同時回寫數據，務必先備份 D1 導出。）
