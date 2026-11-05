# M1 備份與環境預檢報告（M1_BACKUP_AND_PRECHECK.md）

執行時間：2026-11-05 16:27–16:30（GMT+8）· Git commit：`1a54493`（main，工作區僅有 M0 六份未跟蹤報告，無其他未提交代碼）

## 1. 環境確認
| 項目 | 值 |
|---|---|
| 倉庫 | E:/RichAPP/richapps，branch=main，HEAD=1a54493 |
| Pages 部署目錄 | `public/`（project=richapps）——**與倉庫 `amcm/` 目錄分離，此即 P0#1 根因** |
| Worker | amcm-api，D1 binding=DB，cron `0 23 * * *` |
| D1 database_id | `88d5343c-63e1-4ae8-b1a6-27d96662a090` |

## 2. D1 備份（已完成並驗證）
整庫 export 被 FTS5 虛擬表阻塞（wrangler 已知限制），改為**逐表導出**：

| 文件（amcm-worker/backups/） | 大小 | 行數驗證 |
|---|---|---|
| d1-amcm-20261105-preM1-guidelines.sql | 129KB | 155 條 INSERT ✅ |
| d1-amcm-20261105-preM1-chunks.sql | 7.5MB | 3,617 條 INSERT ✅ |
| d1-amcm-20261105-preM1-news.sql | 6.2KB | news 全量 |
| d1-amcm-20261105-preM1-email_subscribers.sql | 870B | 訂閱者全量 |
| d1-amcm-20261105-preM1-sync_state.sql | 183B | 同步狀態 |

`chunks_fts` 未導出：可隨時由 chunks 重建（FTS 為派生數據，無原始信息損失）。備份文件可讀、INSERT 語法完整、字節數與行數核對一致。

## 3. id14 / id15 真值對照（執行前快照）
### 本地 ETL 庫（amcm.db，真值）
| id | doc_number | doc_year | status | superseded_by | chunks |
|---|---|---|---|---|---|
| 14 | 002/2013-AMCM | 2013 | SUPERSEDED | 026/2025-AMCM | 14 |
| 15 | 026/2025-AMCM | 2025 | IN_FORCE | NULL | 2 |

### D1 生產庫（污染現狀，與 M0 報告一致 ✅）
| id | doc_number | doc_year | status | superseded_by |
|---|---|---|---|---|
| 14 | 026/2025-AMCM ❌ | 2025 ❌ | SUPERSEDED | 026/2025-AMCM ❌（=自身編號） |
| 15 | 026/2025-AMCM | 2025 | SUPERSEDED ❌ | 026/2025-AMCM ❌（=自身編號） |

**與 M0 報告一致性核對**：備份 SQL 中 `002/2013-AMCM` 出現 0 次（證明 id14 編號已被覆寫）、`026/2025-AMCM` 出現 6 次（2 行 doc_number + superseded_by 引用）。**生產庫與 M0 報告完全一致，可以進入修復。**

## 4. 安全原則確認
- 備份先於任何修改 ✅
- 無 DROP TABLE / 無重建 / 無清空 chunks 計劃 ✅
- 修改僅限：Worker `src/index.js`（upsert+效力鏈）、`public/amcm/index.html`（同步部署）、D1 兩行 UPDATE ✅
- 秘鑰不通過代碼/Git（CF Token 經環境變量傳遞，不入庫）✅

**Phase 0 通過，進入 Phase 1。**
