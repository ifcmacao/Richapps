# M1 數據修復報告（M1_DATA_REPAIR_REPORT.md）

執行時間：2026-11-05 16:33–16:55（GMT+8）· 真值來源：本地 ETL 庫 `amcm-etl/amcm.db` · 執行前已完整導出 D1 備份（5 表 SQL）

## 1. Phase 2 修復：8 行版本污染（計劃內）

**執行文件**：`amcm-worker/backups/m1-repair-id14-15.sql`（8 條 UPDATE，D1 返回 Total queries executed: 8）

### 修改前後對照（前照取自 D1 實時查詢，後照取自修復後復查）
| id | 修改前（D1 污染值） | 修改後（=ETL 真值） |
|---|---|---|
| 9 | 008/2024-AMCM / 2024 / SUPERSEDED / →008/2024-AMCM | **012/2021-AMCM / 2021 / SUPERSEDED / →008/2024-AMCM** |
| 10 | 008/2024-AMCM / 2024 / SUPERSEDED / →008/2024-AMCM | **008/2024-AMCM / 2024 / IN_FORCE / NULL** |
| 14 | 026/2025-AMCM / 2025 / SUPERSEDED / →026/2025-AMCM | **002/2013-AMCM / 2013 / SUPERSEDED / →026/2025-AMCM** |
| 15 | 026/2025-AMCM / 2025 / SUPERSEDED / →026/2025-AMCM | **026/2025-AMCM / 2025 / IN_FORCE / NULL** |
| 33 | 006/2019-AMCM / 2019 / SUPERSEDED / →006/2019-AMCM | **014/2016-AMCM / 2016 / SUPERSEDED / →006/2019-AMCM** |
| 81 | 004/2022-AMCM / 2022 / SUPERSEDED / →004/2022-AMCM | **006/2013-AMCM / 2013 / SUPERSEDED / →004/2022-AMCM** |
| 83 | 004/2022-AMCM / 2022 / SUPERSEDED / →004/2022-AMCM | **004/2022-AMCM / 2022 / IN_FORCE / NULL** |
| 93 | 008/2019-AMCM / 2019 / SUPERSEDED / →008/2019-AMCM | **013/2016-AMCM / 2016 / SUPERSEDED / →008/2019-AMCM** |

> 說明：實際污染範圍比 M0 報告的 id14/15 更大（共 8 行），修復時依同一真值來源一併處理。

### 修復後斷言（全部通過）
- `superseded_by = doc_number` 行數 = **0** ✅
- id14/15 恢復預期值 ✅（含 summary 恢復，見 §3）
- 狀態分佈 117/38（修復前 114/41）✅

## 2. 計劃外事故與處置（Cron 回歸期間的誤插行）

Cron 修復迭代期間（見 M1_CRON_FIX_REPORT §1.3），三輪有缺陷的同步先後誤插 67+58+58 行（均在 `first_seen` 帶精確時間戳，可精確定位）。處置：
1. **先備份後刪除**：`backups/dup67-backup.json`（67 行全字段）、`backups/dup58-backup.json`、`backups/dup58-r3-backup.json`；
2. 按時間戳 DELETE（三批合計 183 行，changes 均精確匹配）；
3. 刪除後總行數復位 155 ✅。
> 最終版本部署後，系統重新自動插入了其中 **15 條帶文號的真新指引**（id 156-170），此為正確行為；其餘誤插原因（無文號回落鍵不匹配）已從代碼層根除。

## 3. Phase 2 補充修復：23 行 summary 被 Cron 改寫

對比 pre-M1 備份與當前庫，發現 23 行 summary 在歷次 Cron 運行中被官方（含新結構的）值覆寫，其中含文號身份信息（如 id4 `(第028/B/2015-DSB/AMCM 號傳閱文件)` 被改為 `(第011/2015-AMCM號通告)`）。
**處置**：`backups/m1-restore-summaries.sql`（23 條 UPDATE）從 pre-M1 備份恢復 summary 真值，執行成功。代碼層已同步加防護（回落合併不再覆寫有身份信息的 summary）。

## 4. 最終數據狀態（F2 後復查）
| 指標 | 值 | 判定 |
|---|---|---|
| guidelines 總數 | 170（155 原有 + 15 真新） | ✅ |
| SUPERSEDED | 40（含 2 條新推導） | ✅ |
| 自我取代 | 0 | ✅ |
| id14/15 | 與 ETL 真值一致（含 summary） | ✅ |
| 新重複鍵 | 0（14 組重複均為 ETL 原有） | ✅ |
| chunks / news / email_subscribers | 未觸碰（3617 / 20 / 2） | ✅ |

## 5. 未完成事項
- UNIQUE INDEX 未建立（按 M1 要求留待資料遷移方案確認後另行提出）；
- ETL 原有 14 組同鍵重複行待 M2 版本實體治理。
