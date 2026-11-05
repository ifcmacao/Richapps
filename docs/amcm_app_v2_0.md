# 「AMCM 指引通」App 全自主開發需求與系統架構規格書

| 項目 | 內容 |
|---|---|
| 版本 | v2.0（AI自主開發特化版） |
| 日期 | 2026-11-05 |
| 所屬空間 | Richapps (`E:/RichAPP`) |
| 包名 / 域名 | `com.richapps.amcm` / `richapps.pages.dev/amcm/` |
| 構建執行者 | Autonomous Software Engineering AI Agent |
| 授權模式 | Zero-Touch Autonomous Mode（除非涉及第三方密鑰配置或硬體簽名，其餘架構與實作皆由 AI 自行選取最優解並完成開發） |

---

## 0. AI 自主開發協議與行為準則 (AI Agent Protocol)

1. **自主決策權 (Autonomy Guarantee)**：AI 應具備端到端獨立完成前端、後端、爬蟲、資料庫 Schema 設計、自動化測試與構建腳本編寫的能力。若遇到未明確定義的邊界技術細節，AI 應依據「最佳工程實踐、最高執行效能、最低維護成本」三大原則自主決策並實作，無需向用戶確認。
2. **最小化人機干預 (Human-in-the-Loop Minimum)**：僅在以下極端情況下暫停並請求用戶介入：
   - 需要用戶手動提供第三方 API 密鑰（如 Resend API Key、DeepSeek 測試 Key）。
   - 需要用戶進行 Android 實體簽名密鑰（Keystore）的授權操作。
3. **嚴格合規與法律防線**：
   - 本系統**嚴禁在伺服器端持久化儲存 AMCM 的 PDF 原始檔案**，所有下載行為必須重定向至 `cdn.amcm.gov.mo`。
   - 所有 AI 檢索與回答必須**嚴格基於 AMCM 指引原文與法律常規理解**，嚴禁模型產生幻覺（Hallucination）。AI 輸出的每一句結論都必須標註指引編號、章節與條款出處。

---

## 1. 系統整體背景與產品定位

澳門金融管理局（AMCM，www.amcm.gov.mo）的監管指引以「通告」和「傳閱文件」形式發布，分散於銀行業、保險業等獨立頁面。正文以 PDF 形式存於 CDN，且官網為基於 JavaScript 渲染的單頁應用（SPA），無公開 API、無站內全文檢索。

本產品「AMCM 指引通」旨在構建一個**全自動化、精準、具備 AI 問答輔助功能**的金融監管指引檢索與合規分析平台。包含三大形態：**Android 原生/混合 App**、**PWA 應用**、**Web 網頁版**。

---

## 2. 數據抓取、解析與 ETL 流水線規格 (Data Pipeline Specification)

### 2.1 官網逆向工程與爬蟲架構
- **抓取目標**：
  1. 銀行業監管指引列表：`amcm.gov.mo/zh-hant/bank/bank-regulatory-guidelines`
  2. 保險業監管指引列表：`amcm.gov.mo/zh-hant/insurance-sector/regulatory-guidelines`
  3. 新聞與通告：`amcm.gov.mo/zh-hant/news-notice/...`
- **技術選型與備用方案**：
  - **首選方案（API 逆向解析）**：AI 應分析官網 SPA 的 XHR/Fetch 請求，直接對其內部 JSON/REST 接口進行抓取，繞過 DOM 渲染。
  - **備用方案（無頭瀏覽器）**：若官網設置反爬蟲或動態 Token 加密，自動切換至 Cloudflare Browser Rendering (Puppeteer) 進行動態 DOM 抓取。
- **調度策略**：基於 Cloudflare Worker Cron Triggers，每日凌晨 02:00 (UTC+8) 自動執行全量對比與增量抓取。

### 2.2 PDF 處理與多語種流水線
```
[下載 AMCM 原始 PDF (記憶體緩衝)] 
       │
       ├──> (1) 文字型 PDF ──> 自動提取原生 Text/Font Layout
       │
       └──> (2) 掃描型/圖片型 PDF ──> 觸發 OCR 流水線 (Cloudflare AI Vision / PaddleOCR)
                                             │
                                             ▼
                                  提取文字 + 保留座標/頁碼 + 標註置信度 (Confidence Score)
                                             │
                                             ▼
                                  置信度 < 85% 之段落標註 "OCR待校對" 旗標
```
- **多語種對齊與機器翻譯**：
  - 收錄所有語言版本（繁中、簡中、葡文、英文）。
  - 對於僅有葡文/英文而缺少中文的指引，系統自動呼叫翻譯引擎生成**中文機器翻譯對照文本**，並在 DB 中標註 `is_machine_translated: true`。

---

## 3. 資料庫設計 (Database Schema Design)

AI Agent 需在 Cloudflare D1 (SQLite) 上建立並維護以下表結構：

```sql
-- 1. 指引主表 (Guideline Documents)
CREATE TABLE IF NOT EXISTS guidelines (
    id TEXT PRIMARY KEY,                       -- 文件唯一標識 (例: GUID-BANK-2023-017)
    doc_number TEXT NOT NULL,                 -- AMCM 官方文件編號 (例: 第017/B/2023-DSB/AMCM號)
    sector TEXT NOT NULL,                     -- 行業: 'BANKING' | 'INSURANCE' | 'OTHER'
    category TEXT NOT NULL,                   -- 分類 (例: '科技風險管理', '反洗錢')
    title_tc TEXT NOT NULL,                   -- 繁體中文標題
    title_pt TEXT,                            -- 葡文標題
    title_en TEXT,                            -- 英文標題
    effective_date TEXT,                      -- 生效日期 (YYYY-MM-DD)
    publish_date TEXT,                        -- 發布日期 (YYYY-MM-DD)
    status TEXT DEFAULT 'IN_FORCE',           -- 效力狀態: 'IN_FORCE'(生效), 'SUPERSEDED'(已被取代), 'EXPIRED'(已失效)
    superseded_by_id TEXT,                    -- 若被取代，指向新文件 ID
    official_url TEXT NOT NULL,               -- AMCM 官網原始下載 PDF 連結
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 文本分頁與章節索引表 (Guideline Content Chunks - 用於 FTS5 與 RAG)
CREATE TABLE IF NOT EXISTS guideline_chunks (
    id TEXT PRIMARY KEY,
    guideline_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,             -- 原始 PDF 頁碼
    chapter_title TEXT,                       -- 章節標題 (例: "第三章 網絡風險防範")
    content_tc TEXT NOT NULL,                 -- 繁體中文內文 (原文或譯文)
    content_raw TEXT,                         -- 原始語言內文
    is_machine_translated BOOLEAN DEFAULT 0,  -- 是否為機器翻譯
    ocr_confidence REAL DEFAULT 1.0,          -- OCR 置信度 (0.0 - 1.0)
    FOREIGN KEY (guideline_id) REFERENCES guidelines(id)
);

-- 3. 全文檢索虛擬表 (FTS5 Index)
CREATE VIRTUAL TABLE IF NOT EXISTS guideline_fts USING fts5(
    guideline_id UNINDEXED,
    chunk_id UNINDEXED,
    title_tc,
    content_tc,
    tokenize = 'unicode61'
);

-- 4. 版本變更歷史鏈 (Version History Chain)
CREATE TABLE IF NOT EXISTS guideline_versions (
    id TEXT PRIMARY KEY,
    doc_number TEXT NOT NULL,
    version_tag TEXT NOT NULL,                -- 版本號 (例: v1.0, v2.0)
    change_summary TEXT,                      -- 修訂摘要
    guideline_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 郵件訂閱用戶表 (Email Subscribers)
CREATE TABLE IF NOT EXISTS email_subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    is_confirmed BOOLEAN DEFAULT 0,           -- 是否已完成 Double Opt-in
    confirm_token TEXT,                       -- 確認 Token
    subscribed_sectors TEXT,                  -- 訂閱行業 JSON (例: ["BANKING"])
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. AI 智能檢索與問答模組 (BYOK AI System Requirement)

### 4.1 自訂 API 金鑰架構 (Bring Your Own Key - BYOK)
- **架構原則**：系統完全在前端（Client-Side）管理用戶的 API Key。API Key 僅加密儲存於用戶本地瀏覽器的 `localStorage` 或 App 的 `EncryptedSharedPreferences` 中，**絕對禁止上傳至系統後端伺服器**。
- **支援模型與 API 協定**：
  1. **DeepSeek API**（`https://api.deepseek.com/v1`，支援 `deepseek-chat` 與 `deepseek-reasoner` / R1）。
  2. **OpenAI Compatible API**（ChatGPT-4o/4o-mini 等自訂 Endpoints）。
  3. **Anthropic Claude API**（Claude 3.5 Sonnet）。
  4. **Ollama / 本地 LLM**（支援 HTTP 自訂網址）。
- **前端設定面板 UI**：
  - 提供 API 提供商選擇器、API Key 輸入框（帶隱藏/顯示切換）、模型名稱自訂、Temperature 與 Top_P 滑塊。
  - 提供「測試連線」按鈕，發送微量 Token 測試 Key 的有效性與延遲。

### 4.2 AI 嚴格基於指引原文回答 (Strict Regulatory RAG Pipeline)
AI 檢索問答流程必須嚴格執行以下 Prompt 約束與檢索增強（RAG）邏輯：

```
[用戶提出法規問題] 
       │
       ▼
[混合檢索階段] ──> FTS5 關鍵字搜尋 + 向量/語意匹配 (針對條款內文 Chunk)
       │
       ▼
[構建 Context 注入 Prompt] ──> 提取 Top-K 最相關指引段落 (含 doc_number, title, page_number, content)
       │
       ▼
[發送至用戶設定的 API (DeepSeek等)] ──> 帶入 System Prompt (約束邏輯)
       │
       ▼
[前端解析輸出] ──> 渲染帶有「出處腳註 (Footnotes)」與「點擊直達原始頁碼」的回答
```

#### **System Prompt 規範範本 (AI Agent 必須硬編碼至 RAG 模組)**：
```text
你是一位極度嚴謹的澳門金融監管（AMCM）合規專家。你的任務是嚴格根據背景資訊（Context）中提供的 AMCM 官方指引條文，回答用戶的問題。

【必須遵守的鐵律】：
1. 你的回答必須 100% 嚴格依據背景資訊中的 AMCM 指引原文及澳門金融常規理解。
2. 切勿產生任何幻覺，切勿引用背景資訊中未提及的外部法規或自行推測。若背景資訊不足以回答問題，請直接回答：「根據現有 AMCM 檢索到的指引，未包含此問題的明確規定，建議直接查閱上位法《金融體系法律制度》或諮詢 AMCM 官方。」
3. 每一段分析、結論或合規要求，必須在句末強制加上出處腳註，格式為：[指引編號，第X頁，章節名稱]。
4. 若指引內容屬於機器翻譯件，請在回答末尾提示：「部分參考內容為機器翻譯件，請以官方葡文/英文原文為準。」
```

---

## 5. 前端與多端 UI/UX 規範 (Frontend Specification)

### 5.1 視覺與品牌語言
- **配色方案**：深藍/靛藍（`#0F172A` 或 `#1E3A8A`）作為底色與導航列，搭配高雅沉穩的金黃/香檳金（`#D97706` / `#B45309`）作為點綴色與效力徽章，展現政務與金融專業權威感。
- **字體與排版**：採用標準繁體中文系統字體（PingFang TC / Microsoft JhengHei），適當增加行高（1.6）以優化法律條文閱讀體驗。

### 5.2 核心頁面功能矩陣

```
┌─────────────────────────────────────────────────────────┐
│              「AMCM 指引通」多端頁面結構                 │
├───────────────┬───────────────┬───────────────┬─────────┤
│ 1. 導航/首頁  │ 2. 指引大廳   │ 3. 詳情與AI   │ 4. 設定 │
│  - 最新動態   │  - 銀行業/保險│  - 條文分頁   │  - API  │
│  - 效力變更   │  - 多重篩選   │  - 原文PDF點擊│  - 訂閱 │
│  - 快速搜尋   │  - FTS5 全文  │  - AI 提問對話│  - 離線 │
└───────────────┴───────────────┴───────────────┴─────────┘
```

1. **指引大廳 (Guideline Directory)**：
   - 頂部多維度篩選：[行業：全選/銀行/保險] [狀態：全部/生效中/已廢止/已被取代] [分類標籤]。
   - 條目卡片：顯示官方編號（如 `017/B/2023-DSB/AMCM`）、繁/葡/英標題、發布日期、效力徽章（🟢 現行生效 / ⚪ 已失效 / 🔶 已被取代）。
   - 點擊卡片直接進入詳情，下載按鈕**強制在新分頁開啟 AMCM 官網原始 PDF**。

2. **條文閱讀與 AI 助手浮窗 (Document Reader & AI Assistant)**：
   - **雙欄/分頁視圖**：左側為指引目錄與文本內容，右側（或底部 Popover）為 AI 對話助手。
   - **高亮與跳轉**：全文檢索命中關鍵字黃色高亮；點擊 AI 回答中的腳註，左側內文自動滾動至對應段落與 PDF 頁碼。
   - **對照閱讀**：對於無中文版指引，提供「原文 / 中文機翻」左右雙欄切換。

3. **AI 擴充功能設定 (AI Configuration)**：
   - 設置 DeepSeek API Key / OpenAI Key / 自訂 Endpoint。
   - 選擇預設模型（如 `deepseek-reasoner` 進行深度合規推理，`deepseek-chat` 進行快速檢索回答）。

4. **郵件訂閱與推送管理 (Subscription Control)**：
   - 用戶輸入 Email，發送 Double Opt-in 確認信。
   - 訂閱成功後，每當 Worker Cron 偵測到新指引發布或變更，系統自動調用 Resend API 發送 HTML 格式的每日摘要。

---

## 6. 端到端自動化構建與部署流程 (CI/CD Pipeline)

AI Agent 需要建立並執行以下構建腳本：

### 6.1 Cloudflare 部署 (Web & Worker API)
- 靜態前端（React / Vite 或 HTML5 Single-Page Bundle）部署至 Pages 專案：`richapps.pages.dev/amcm/`。
- 後端 Worker API 與 Cron 部署至 Cloudflare Workers，綁定 D1 Database (`amcm-db`) 與 FTS5 引擎。

### 6.2 Android APK & PWA 打包 (No-Gradle Pure Shell Automation)
- 復用現有項目構建腳本 `E:/RichAPP/build-apk.sh` 及 `build-aab.sh`。
- 使用 Android SDK 命令行工具（`aapt2`, `d8`, `apksigner`）跳過 Gradle，將 H5 Web 應用與 WebView 殼套件直接打包編譯為原生 Android APK。
- 自動生成 `manifest.json` 與 Service Worker，提供 PWA 「新增至主畫面」支援與 Web Push 推送。

---

## 7. 驗收標準與測試用例 (Acceptance Criteria)

AI Agent 完成開發後，必須通過以下自動化與邏輯驗收：

| 測試項 | 驗收標準 | 判定方式 |
|---|---|---|
| **抓取完整性** | 完整覆蓋 AMCM 銀行及保險業全部現行與廢止指引 | 比對 D1 表中紀錄總數與官網列表總數 |
| **PDF 文本化** | 文字型 PDF 100% 解析；掃描型 PDF OCR 覆蓋率 > 98% | 檢查 `guideline_chunks` 置信度欄位 |
| **檢索效能** | FTS5 全文檢索回應時間 < 300ms | 基準效能測試報告 |
| **合規下載** | 點擊下載 100% 導向 `cdn.amcm.gov.mo` 域名，無本地快照下載 | HTTP Header 與 URL 稽核 |
| **BYOK AI 邏輯** | 設定 DeepSeek Key 後能正確對話，回答嚴格附帶 `[指引編號, 頁碼]` 且無幻覺 | Prompt 單元測試驗證 |
| **多端相容** | Web 版、PWA 及 Android APK 均能正常加載與離線快取 | 端到端自動化 UI 測試 |
