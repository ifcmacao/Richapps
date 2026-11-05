# M0 系統架構及技術審計報告（M0_SYSTEM_AUDIT.md）

審計日期：2026-11-05 · 審計人：Workbuddy Agent（只讀模式）· 基準：amcm_v3_1.md
審計方式：代碼審查 + API 實測 + D1 遠端只讀 SQL 抽查 + 本地 ETL 數據比對。**未修改任何生產環境代碼、結構或數據。**

## 1. 系統架構（現狀）

```
[AMCM 官網 JSON API]
        │ (本機 ETL: fetch/extract/OCR/translate → amcm.db)
        │ (Worker Cron 23:00 UTC: 元數據/新聞增量 → D1)
        ▼
[D1 amcm-db] ←── [Worker amcm-api (routes+cron)] ──→ [Resend 郵件]
                        ▲
[Cloudflare Pages richapps] ── WebView 壳 APK (android-amcm)
   ├─ /amcm/ 指引通前端   ├─ /downloads 下載頁   ├─ /privacy
```

## 2. 版本一致性審計（已確認）

| 組件 | 倉庫版本 | 線上版本 | 一致性 |
|---|---|---|---|
| 前端 `/amcm/` | `amcm/index.html` = **v3.1**（54,573B，含排版系統/儀表板/雙閱讀模式） | **v2.1**（39,927B，無 `law-article-title` 等 v3.1 標記） | ❌ **不一致** |
| 下載頁 `/downloads` | 已含 AMCM 卡片 | 200 OK，已含 | ✅ |
| Worker | `src/index.js` v3（cron+digest+SENDER_EMAIL） | Version `b99f1a9a`，cron `0 23 * * *` 生效 | ✅ |
| Pages 部署 | 部署命令指向 `public/` 目錄 | `public/amcm/index.html` 仍為 v2.1 舊檔 | ❌ **根因** |

**根因（已確認）**：v3.1 前端只寫入 `amcm/index.html`，未同步到部署目錄 `public/amcm/index.html`，Pages 部署的是舊檔。→ 詳見 BUG_REGISTER #1。

## 3. D1 數據庫結構審查（已確認）

表：`guidelines`（155）、`chunks`（3,617）、`chunks_fts`（FTS5/unicode61）、`news`（20）、`email_subscribers`（2，0 已確認）、`sync_state`（last_sync_at=2026-11-05T07:11:45Z）。
v2 升級採 ALTER TABLE 增列（doc_year/status/superseded_by/first_seen），無獨立唯一約束 → 是 P0 數據污染的根本條件（見 4.2）。

## 4. 重大發現

### 4.1 前端版本脫節（P0）— 見 BUG_REGISTER #1
### 4.2 Cron 同步污染效力鏈（P0）— 見 BUG_REGISTER #2
證據：D1 中 id=14 與 id=15（《可動用現金及最低抵償規則》）doc_number 同為 `026/2025-AMCM`、雙雙 SUPERSEDED 且 superseded_by 指向自身編號；而本地 ETL 庫 id=14 仍為 `002/2013-AMCM`、id=15 IN_FORCE。證明 Cron 的 upsert 以 `sector+title_tc` 為鍵，同標題不同版本的行被覆寫。
### 4.3 7 份指引無任何文本（P1）
id 133–135、141–144（保險中介人 CPD/准照類，多為多語言葉節點重複條目，pdf_tc 均為空）。
### 4.4 原文頁眉/頁腳/重複行殘留於 chunks（P1）
抽查證據：id=1 zh_TW p1 = `1|傳閱文件|傳閱文件|傳閱文件…`；id=13 en = `Page 2 of 38…`；id=20 = `1/19…`。v3.1 清洗引擎已寫好但因 #1 未上線。
### 4.5 搜索結果重複（P2）
gid=129「雲端」命中 p4 出現兩條完全相同摘要（不同 locale 行近重複，API 無去重）。

## 5. 環境變量與密鑰管理（已確認）
- Worker secrets：RESEND_API_KEY、ADMIN_TOKEN、SENDER_EMAIL（`noreply@mail.gejw.top`，域名 2026-11-05 15:53 驗證通過）✅
- 本機 `amcm-etl/secrets.env`（DeepSeek/Resend Key）未入庫 ✅（git 忽略需在 M1 複核）
- ⚠️ 對話中暴露過多個臨時 Token，建議輪換（人工待辦）。

## 6. 測試執行能力聲明
- API/SQL/數據：已實測（見各報告證據）。
- 瀏覽器 UI 交互（閱讀模式切換、高亮滾動、儀表板）：**無法實測**（無瀏覽器自動化權限），以代碼審查 + 靜態驗證代替，已在 FUNCTION_MATRIX 標註「尚未驗證」。
- 郵件全鏈路：訂閱寫庫會產生生產數據，按審計原則**未實測**（僅讀取 email_subscribers 統計）；歷史實測記錄：2026-11-04 確認信發送成功（測試地址）。
- Cron 日誌：Workers 無歷史日誌保留，通過 `sync_state.last_sync_at` + 數據變化間接驗證已執行。
