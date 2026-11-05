# 「AMCM 指引通」系統全面重構與功能深化需求規格書 (v3.1 - 深度診斷與排版重構版)

| 項目 | 內容 | 
| ----- | ----- | 
| 目標 URL | `https://richapps.pages.dev/amcm/` | 
| 執行主體 | Workbuddy / Autonomous Software Engineering Agent | 
| 任務性質 | 現網硬傷修復 (第一頁丟失/排版美化) + AI 雙路清洗 + 360° 指引研讀儀表板 + 監管百科知識圖譜 | 
| 核心要求 | 解決致命渲染 Bug、導入金融級 Typography 排版系統、零歧義邏輯約束 | 

## 1. 現網硬傷深度診斷與緊急修復清單 (Critical Bugfixes)

經過對 `https://richapps.pages.dev/amcm/` 的 DOM 結構與渲染邏輯審查，發現以下必須優先修復的「致命硬傷」：

```
[致命硬傷 1: 第一頁缺失] ──> 原因：Chunk 分頁索引 0/1 混淆，第一頁 page_number 丟失
                        ──> 修復：強制預設加載 page=1，補齊全 Array 渲染導航

[致命硬傷 2: 文本無排版] ──> 原因：直接渲染裸 Plaintext，缺乏語意化標籤與法律字體
                        ──> 修復：導入 Regulatory Typography System，條款結構化與美化

[致命硬傷 3: 佈局塌陷]   ──> 原因：篩選列缺乏響應式 Flex/Grid 容器，數據加載無 Skeleton
                        ──> 修復：重新設計大廳頂部 FilterBar 組合框，加載時顯示骨架屏
```

### 1.1 修復「打開指引後第一頁不顯示」Bug
* **Bug 現象**：用戶開啟任何指引詳情頁時，正文頂部直接從第二頁或第三頁開始，第一頁（含標題、文號、前言）丟失。
* **技術執行要求**：
  1. 重構 `GuidelineDetailView` 元件，檢查前端分頁/滾動加載邏輯。
  2. 確保後端 API 返回的 `chunks` 陣列依 `page_number ASC` 嚴格排序，且包含 `page_number: 1`。
  3. 實作「全頁面連續捲動模式（Continuous Scroll）」與「按頁切換模式（Page by Page）」，預設定位於 `Page 1` 頂部。

### 1.2 導入法規專業排版系統 (Regulatory Typography & Styling)
* **Bug 現象**：正文框字體為系統預設黑體，字距緊密，條款序號（如「第一條」、「（一）」）混在段落中，極難閱讀。
* **美化標準**：
  * **字體組合**：繁體中文採用 `Noto Serif TC` / `PingFang TC` / `Microsoft JhengHei`；英葡文採用 `Georgia` / `Times New Roman`。
  * **字號與行高**：正型字號 `16px` (`1rem`)，行高 `1.85`，段落間距 `14px`。
  * **條款語意化解析與渲染 (Parser Rules)**：
    * 正則匹配 `^第[一二三四五六七八九十0-9]+條` 或 `^章節/主題標題` ──> 自動渲染為帶金屬質感邊框的 `<h3 class="law-article-title">`。
    * 正則匹配 `^（[一二三四五六七八九十0-9]+）` 或 `^\([0-9]+\)` ──> 自動渲染為首行縮排的子條款段落 `<p class="law-subarticle">`。
    * 腳註標記 `[1]` ──> 渲染為可點擊/懸停的沉浸式腳註上標 `<sup class="footnote-ref">`。

---

## 2. 雙路 AI 數據清洗與格式修復流水線 (Dual-Track AI Pipeline)

### 2.1 非 OCR / 原生 PDF 重複字串與混亂格式修復 (Parsing Repair Engine)
* **重複標題去重**：正則 + 語意平滑演算法，消除 PDF 解析產生的「連續 3-4 行相同標題」現象。
* **頁眉/頁腳/頁碼剝離**：自動識別並切除「第 X 頁 / 共 Y 頁」、「澳門金融管理局 - 傳閱文件」等文字，不讓其進入內文。
* **腳註（Footnotes）獨立切分**：正文中的腳註獨立抽離至 `guideline_footnotes` 資料表，於前端底部或 Hover 卡片獨立呈現。

### 2.2 OCR 掃描件多重 AI 校對 (Multi-LLM OCR Consensus)
* 同一圖片/頁面分別由兩套 OCR 引擎識別，遇到 Diff 時發送至 LLM 評估選取最適答案。
* 置信度 < 90% 的段落，前端顯眼提示：「本段包含 OCR 識別/修復內容，請以官方 PDF 原文為準」。

---

## 3. 指引 360° AI 智能研讀儀表板 (Briefing Dashboard)

指引詳情頁頂部，增加一個「AI 輔助研讀儀表板」卡片：
1. **📌 核心意圖與背景解釋**：出台背後的金融監管邏輯。
2. **🔑 關鍵要點總結 (Key Takeaways)**：合規 Mandatory 要求與時限。
3. **🛡️ 對金融機構的落實建議 (Actionable Steps for CCO)**：可勾選的自查步驟。
4. **📖 關鍵術語與概念**：高頻詞彙。
5. **🔗 關聯指引與修訂廢止鏈**：新舊替代關係。

---

## 6. BYOK AI 模組與郵件全流水線 (BYOK AI & Email Pipeline)

* **API Key 配置 Drawer**：支援 DeepSeek API / OpenAI，Key 僅存於 LocalStorage (`AMCM_BYOK_CFG`)。
* **郵件 Double Opt-in & 退訂**：
  * `POST /api/subscribe` -> 發送確認信。
  * `GET /api/unsubscribe?token=xxx` -> 一鍵退訂並從 D1 資料庫刪除。

---

## 7. UI/UX 視覺與顏色規範 (Design System)

* **主色**：`Slate 900` (`#0f172a`) 深藍。
* **點綴色**：`Amber 600` (`#d97706`) 金黃。
* **正文背景**：`Slate 50` (`#f8fafc`)。
* **字體排版**：條款獨立卡片化，邊框 `1px solid #e2e8f0`，圓角 `8px`。

---

## 8. Workbuddy 執行驗收清單

* [ ] 修復詳情頁 Page 1 缺失問題，確保開啟即看第一頁。
* [ ] 導入專業法律 Typography 排版，標題、條款序號、腳註語意化渲染。
* [ ] 完成 AI 雙路數據清洗（去重、頁眉頁腳切離）。
* [ ] 完成 360° AI 研讀儀表板與監管小百科詞條自動超連結。
* [ ] 部署至 `richapps.pages.dev/amcm/`。