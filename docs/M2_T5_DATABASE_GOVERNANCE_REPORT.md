# M2-T5 数据库唯一性与结构治理报告

执行时间：2026-11-05 21:45–22:00（GMT+8）｜SQL：`amcm-etl/d1-m2t5-index.sql`

## 一、预检（本地真值镜像，与 Worker matchKey 同语义）

键定义：有文号行 = `sector + normTitle + normDoc`；无文号行 = `sector + normTitle`。

- 治理后有文号行 135，**冲突 = 0** ✅（治理前 5 组，详见 T4 报告）；
- 无文号行 20，同键 3 组 = T4 确认的「同标题不同文件」（附件/不同传阅文件），**保留，不建唯一约束**。

## 二、已执行的 D1 结构变更

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_guidelines_sector_titledoc
  ON guidelines(sector, title_tc, doc_number)
  WHERE doc_number IS NOT NULL AND doc_number != '';
UPDATE guidelines SET superseded_by=NULL
  WHERE superseded_by IS NOT NULL AND superseded_by=doc_number;  -- 自我取代清零（防御性）
```

- **作用**：数据库层根治 Cron 重复插入——任何未来 sync 若试图插入同 sector+标题+文号的行将被 SQLite 拒绝，Worker 的 added 计数会出现可观测错误而非静默重复；
- **回滚**：`DROP INDEX idx_guidelines_sector_titledoc;`（纯索引，不动数据）；
- **兼容性**：部分索引只约束有文号行，不影响 3 组合法同标题行与全部现有查询（guidelines 主键、chunks 外键、FTS 均未动）。

## 三、其他治理项

- 自我取代（superseded_by = doc_number）断言 = 0（M1 修复 + 本轮防御性 UPDATE）；
- 未建 chunks 外键类新约束（现有数据已通过应用层保证，且外键会阻塞既有维护流程——M0 已有教训）。

## 四、验证受限说明

D1 读配额当日耗尽，索引创建后的线上行为验证（插入冲突测试、cron 回归）待明早 08:00 HKT 配额重置后补测；索引创建语句本身已成功执行（executed: 2）。
