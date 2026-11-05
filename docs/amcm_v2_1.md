# 「AMCM 指引通」系統全面重構與功能深化需求規格書 (v2.1)

| 項目 | 內容 |
| --- | --- |
| 目標 URL | `https://richapps.pages.dev/amcm/` |
| 執行主體 | Workbuddy / Autonomous Software Engineering Agent |
| 任務性質 | 系統極致化重構（UI/UX 升級、搜尋與高亮錨點、BYOK AI 模組、郵件訂閱全流水線） |
| 核心要求 | 零歧義指令、嚴格邏輯約束、極致專業度與金融級視覺質感 |

---

## 1. 審查發現之核心痛點與重構目標

經過對現網（`richapps.pages.dev/amcm/`）的嚴格審查，現狀與金融合規專業工具標準存在顯著差距。本規格書旨在指導 Workbuddy 完成一次性的全面重構，達到**「專業、易用、美觀、高頻持續使用」**的最終目標。

### 核心問題對照表與改造要求

```
現狀痛點                                    重構目標（Must-Have）
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ 1. 導覽與分類過於簡陋                │   │ 1. 完整對標 AMCM 官網兩級主題分類    │
│ 2. 清單缺少發布時間與效力狀態        │ ──>│ 2. 卡片/表格顯眼標註編號、日期、徽章 │
│ 3. 搜尋結果點擊後無法定位與高亮      │   │ 3. 精確 DOM 錨點滾動 + 黃色螢光高亮  │
│ 4. 動態區只有標題無實質內容          │   │ 4. 提供條文變更摘要與影響分析        │
│ 5. 缺乏 AI 對話與 API Key 配置       │   │ 5. 實作 BYOK (DeepSeek等) 嚴格合規RAG│
│ 6. 缺少完整的郵件訂閱與一鍵退訂      │   │ 6. 實作 Double Opt-in + 安全退訂流   │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
```

---

## 2. 詳細功能模組與技術執行規格

### 2.1 導覽系統與多維度篩選矩陣 (Navigation & Advanced Filtering)

#### 2.1.1 官網分類樹狀對齊 (Data Schema Mapping)
系統必須嚴格按照 AMCM 官網層級重構資料數據字典：

1. **銀行業 (Banking Sector)**：
   * 企業管治及內部控制 (Corporate Governance & Internal Control)
   * 資本充足 (Capital Adequacy)
   * 信用風險 (Credit Risk)
   * 流動性風險 (Liquidity Risk)
   * 利率風險 (Interest Rate Risk)
   * 操作風險與科技風險管理 (Operational & Technology Risk Management - 包含電子銀行、網絡風險、人工智能注意事項)
   * 反洗錢及打擊資助恐怖主義 (AML/CFT)
2. **保險業 (Insurance Sector)**：
   * 保險業務監察 (Insurance Supervision)
   * 退休基金 (Pension Funds)
   * 反洗錢操作指引 (AML/CFT Guidelines)
   * 網絡安全管理指引 (Cybersecurity Guidelines)

#### 2.1.2 多維度組合篩選與排序控制項
在大廳（Directory）頁面頂部實作多功能篩選列：

* **多重過濾**：
  * `行業 (Sector)`：全部 / 銀行業 / 保險業
  * `主題子類 (Category)`：動態加載對應行業下的二級分類
  * `效力狀態 (Status)`：全部 / 🟢 現行生效 / ⚪ 已失效 / 🔶 已被取代
  * `語言 (Language)`：全部 / 含繁體中文 / 葡英獨有（機翻）
* **動態排序 (Sorting Options)**：
  * 發布日期（最新 -> 最舊）`[預設]`
  * 發布日期（最舊 -> 最新）
  * 文件編號（升冪/降冪）
  * 生效日期（最新 -> 最舊）

---

### 2.2 清單卡片與元數據渲染 (Metadata Rendering)

每個指引卡片/表格列必須顯示以下完備資訊：

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [銀行業 · 科技風險]  🟢 現行生效                      發布日期：2023-11-15 │
│ 第 017/B/2023-DSB/AMCM 號傳閱文件                                        │
│ 標題：網絡風險管理指引 (Guideline on Cybersecurity Management)            │
│ 摘要：本指引旨在規範金融機構在雲端運算及 AI 應用中的風險控制標準...     │
│ ─────────────────────────────────────────────────────────────────────── │
│ [🔗 查看內文與AI分析]   [🌐 AMCM 官網原始 PDF (cdn.amcm.gov.mo)]         │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **效力狀態徽章 (Status Badge)**：
   * `🟢 現行生效 (IN_FORCE)`：綠色膠囊徽章。
   * `⚪ 已失效 (EXPIRED)`：灰色膠囊徽章。
   * `🔶 已被取代 (SUPERSEDED)`：橙色膠囊徽章，**點擊後跳出 Tooltip 或 Modal 顯示取代它的新文件編號與連結**。
2. **官方原文下載按鈕**：
   * 標註 `cdn.amcm.gov.mo` 域名，點擊強制在 `_blank` 新頁籤開啟，不觸發本地下載。

---

### 2.3 全文檢索與 DOM 錨點平滑高亮 (Search, Anchor & Highlighting)

這是解決「搜尋後看不懂落在哪裡」的核心體驗功能。

#### 2.3.1 搜尋結果渲染 (SearchResult)
* 搜尋框輸入關鍵字（如「雲端運算」），結果列表需高亮顯示匹配前後的 50 個字元上下文片段。

#### 2.3.2 點擊跳轉與精確定位演算法
1. 點擊搜尋結果時，路由攜帶參數：`/guideline/:id?highlight=關鍵字&chunkId=xx&page=x`。
2. 內文頁面加載完成後，執行以下腳本邏輯：
   * 找到對應 `chunkId` 或包含關鍵字的 DOM 節點。
   * 呼叫 `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` 進行平滑滾動。
   * 使用 CSS Class 動態包裹匹配文字：
     ```css
     .search-highlight-active {
       background-color: #fef08a; /* 螢光黃 */
       color: #0f172a;
       padding: 2px 4px;
       border-radius: 4px;
       box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
       animation: pulse-highlight 2s infinite;
     }
     ```
   * 在頁面頂部浮現工具列：「已為您定位至第 X 頁命中段落 [上一處] [下一處]」。

---

### 2.4 「最新動態」時間線深化 (Enhanced Timeline)

取消「只有標題」的現狀，重構為富文本時間線卡片：

* **事件類型標籤**：`[新指引發布]` / `[條文修訂]` / `[文件廢止]` / `[監管新聞]`。
* **動態卡片內容**：
  * 事件發生日期 (YYYY-MM-DD)。
  * 關聯指引文件編號與標題。
  * **條文變更 100 字極簡摘要**（自動提煉核心影響，如：「調整流動性覆蓋率計算公式，自 2026 年 12 月 1 日起生效」）。
  * 快捷操作按鈕：`[直達變更條文]`、`[對比舊版本]`。

---

### 2.5 BYOK (Bring Your Own Key) AI 合規助手模組

系統必須允許用戶自備 API Key，實現零伺服器 API 成本、用戶隱私安全的智能問答。

```
┌─────────────────────────────────────────────────────────┐
│                 ⚙️ AI 設定與 API 金鑰配置                │
├─────────────────────────────────────────────────────────┤
│ API 提供商:  [ DeepSeek (api.deepseek.com)          ▼ ] │
│ API Key:    [ sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx        ]  │
│ 選擇模型:    [ deepseek-reasoner (R1 深度推理)      ▼ ] │
│ Base URL:   [ https://api.deepseek.com/v1            ]  │
│                                                         │
│ [ 🧪 測試連線 ]  ──> (狀態: 🟢 連線成功，延遲 120ms)     │
└─────────────────────────────────────────────────────────┘
```

#### 2.5.1 前端 API Key 管理 (Security & Storage)
* **安全存儲**：Key 僅允許儲存在瀏覽器 `localStorage`（名稱：`AMCM_BYOK_KEY`），禁止上傳至 Cloudflare Worker 或任何第三方伺服器。
* **多模型支援**：
  * DeepSeek API (`deepseek-chat`, `deepseek-reasoner`)
  * OpenAI API (`gpt-4o`, `gpt-4o-mini`)
  * Anthropic / Custom Local (Ollama) Endpoints

#### 2.5.2 RAG 檢索與嚴格 Prompt 約束
當用戶在指引頁面提問時，系統採取以下 Prompt 注入機制：

```markdown
System Prompt:
你是一位極度嚴謹的澳門金融監管（AMCM）合規專家。你的任務是嚴格根據背景資訊（Context）中提供的 AMCM 官方指引條文，回答用戶的問題。

【必須遵守的鐵律】：
1. 你的回答必須 100% 嚴格依據背景資訊中的 AMCM 指引原文及澳門金融常規理解。
2. 切勿產生任何幻覺，切勿引用背景資訊中未提及的外部法規或自行推測。若背景資訊不足以回答問題，請直接回答：「根據現有 AMCM 檢索到的指引，未包含此問題的明確規定，建議直接查閱上位法《金融體系法律制度》或諮詢 AMCM 官方。」
3. 每一段分析、結論或合規要求，必須在句末強制加上出處腳註，格式為：[指引編號，第X頁，章節名稱]。
4. 若指引內容屬於機器翻譯件，請在回答末尾提示：「部分參考內容為機器翻譯件，請以官方葡文/英文原文為準。」
```

---

### 2.6 郵件訂閱與一鍵退訂全流水線 (Email Subscription & Unsubscribe Flow)

為保證合規與防止垃圾郵件濫用，必須採用 **Double Opt-in（雙重確認）** 與 **一鍵式退訂** 機制。

```
[用戶輸入 Email 點擊訂閱] 
       │
       ▼
[發送確認郵件 (含 Token 連結)] ──> 用戶點擊驗證 ──> [寫入 D1 資料庫 (is_confirmed = 1)]
                                                              │
                                                              ▼
                                                 [Cron 偵測到 AMCM 新動態]
                                                              │
                                                              ▼
                                                 [發送 HTML 摘要郵件 (帶退訂 Link)]
                                                              │
                                                              ▼
                                                 [點擊退訂 Link] ──> [即時自 D1 刪除]
```

#### 2.6.1 訂閱組件 (Subscription Component)
* 放置於首頁底部與側邊欄。
* 輸入框：`[請輸入您的工作電子郵箱]` + 複選框（`[x] 銀行業動態` `[x] 保險業動態`）。

#### 2.6.2 郵件觸發與 Worker API 介面

1. **`POST /api/subscribe`**：
   * 接受 `{ email, sectors }`。
   * 生成 `confirm_token`（UUIDv4），寫入 `email_subscribers`（`is_confirmed = 0`）。
   * 呼叫 Resend API 發送驗證信，內含驗證網址：`https://richapps.pages.dev/amcm/confirm-subscription?token=xxx`。
2. **`GET /api/confirm-subscription?token=xxx`**：
   * 校驗 Token，將 `is_confirmed` 改為 `1`。頁面顯示成功認證視覺彈窗。
3. **`GET /api/unsubscribe?token=xxx`**：
   * 校驗 Token，直接從 `email_subscribers` 表中刪除該筆記錄。
   * 頁面顯示：「您已成功退訂 AMCM 指引通最新動態，我們已永久刪除您的郵箱數據。」

#### 2.6.3 每日郵件推送範本 (Email HTML Template)
* **主題**：`[AMCM 指引通] 每日金融監管最新動態摘要 (2026-11-05)`
* **內容**：
  * AMCM 視覺標頭（深藍底色 + 金色文字）。
  * 今日新增/修訂條文列表（帶文件編號與生效日期）。
  * 每條動態配有 `[閱讀詳情]` 連結。
  * **頁尾（Footer）**：顯眼放置「如需調整訂閱喜好或取消訂閱，請點擊 [一鍵取消訂閱]」。

---

## 3. 視覺設計規範 (UI/UX Design System)

為了達成「讓人眼前一亮」的視覺體驗，請 Workbuddy 嚴格執行以下 CSS/Tailwind 設計規範：

* **主色系 (Primary)**：`Slate 900` (`#0f172a`) - 展現沉穩、權威的金融法規感。
* **輔助主色 (Accent/Gold)**：`Amber 600` (`#d97706`) / `Amber 500` (`#f59e0b`) - 用於徽章、按鈕 Hover、高亮框與品牌標誌。
* **背景色 (Background)**：`Slate 50` (`#f8fafc`) 搭配純白卡片背景 (`#ffffff`)，確保高對比度閱讀體驗。
* **字型 (Typography)**：
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans HK", "Microsoft JhengHei", sans-serif;
  ```
* **卡片陰影與邊框**：`border: 1px solid #e2e8f0; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);`，hover 時微微浮起 `transform: translateY(-2px);`。

---

## 4. Workbuddy 執行里程碑與驗收清單

請 Workbuddy 按以下順序分階段實作並部署：

- [ ] **Phase 1: 數據結構與篩選重構**
  - [ ] 更新 JSON/D1 資料庫 schema，加入 AMCM 官網兩級主題分類。
  - [ ] 重構前端指引大廳，實作多條件組合篩選與「發布時間/編號」排序功能。
  - [ ] 在卡片與列表中補齊「發布日期」、「生效狀態徽章」、「取代關係」。

- [ ] **Phase 2: 搜尋高亮與動態時間線深化**
  - [ ] 實作檢索結果點擊後的 DOM 平滑滾動 (`scrollIntoView`) 與螢光黃高亮動畫。
  - [ ] 重構「最新動態」頁面，顯示條文變更摘要與快捷按鈕。

- [ ] **Phase 3: BYOK AI 合規助手與 API 配置**
  - [ ] 開發 API Key 設定 Drawer，支援本地 `localStorage` 加密存儲與連線測試。
  - [ ] 整合 DeepSeek API，注入嚴格不產生幻覺、帶有 `[指引編號, 頁碼]` 出處的 RAG Prompt。

- [ ] **Phase 4: 郵件訂閱/退訂全流水線**
  - [ ] 實作前端訂閱表單與 Double Opt-in 郵件驗證。
  - [ ] 在 Cloudflare Worker 中補齊 `/api/subscribe`與 `/api/unsubscribe` 路由。
  - [ ] 構建響應式 HTML 郵件範本，確保包含一鍵退訂連結。

- [ ] **Phase 5: 全面測試與部署**
  - [ ] 部署至 `richapps.pages.dev/amcm/` 並進行端到端功能驗收。
