# AMCM 指引通 — 项目状态与交接文档

更新：2026-11-05 22:35（GMT+8）｜状态：**M2 完成（带 1 项待配额恢复的验证）**

## 一、系统架构

```
用户 → https://richapps.pages.dev/amcm/      （Cloudflare Pages，前端 v3.1 SPA）
     → https://amcm-api.ifcmacao.workers.dev （Cloudflare Worker amcm-api，Cron 0 23 * * *）
                                          → D1 amcm-db（88d5343c-…a090，FTS5 中文逐字索引）
                                          → Resend（noreply@mail.gejw.top，已验证域名）
ETL（本机 E:/RichAPP/amcm-etl/）：官方 CMS API → PDF 下载/抽取/OCR/机翻 → 本地 amcm.db（真值）→ 增量导出 D1
Android：com.richapps.amcm（WebView 壳）+ com.richapps.afcm；GitHub Releases 分发
```

## 二、关键资产位置

| 资产 | 位置 |
|---|---|
| 前端源文件 | `richapps/amcm/index.html`（**唯一编辑入口**，改后必须复制到 `public/amcm/` 并 diff 校验再部署） |
| Worker 源码 | `richapps/worker/amcm-api/`（Git 管理）；旧 `amcm-worker/` 仅存备份 |
| D1 备份 | `amcm-worker/backups/d1-amcm-20261105-preM2-*.sql`（5 表） |
| ETL 真值库 | `amcm-etl/amcm.db`（含 chunks_original 清洗前快照） |
| 删除行归档 | `amcm-etl/m2_t4_*_backup.json`、清洗 Diff `m2_t2_diff.json` |
| 项目报告 | `richapps/docs/`（M0、M1、M1.5、M1.6、M2 全系列） |

## 三、数据模型要点

- guidelines 155 条：doc_number 唯一索引（sector+title_tc+doc_number，部分索引）；效力链 status/superseded_by，自我取代=0；
- chunks 3,680 页：is_ocr（扫描页）、is_machine_translated（机翻，永不冒充原文）、needs_review（低置信）；
- chunks_fts：FTS5 unicode61 + **CJK 逐字拆分**（新增数据必须同样拆分后再插入 FTS）；
- email_subscribers：Double Opt-in（confirm_token / unsub_token）。

## 四、操作手册（常用命令）

```bash
# 前端部署（改 amcm/index.html 后）
cd E:/RichAPP/richapps && cp amcm/index.html public/amcm/index.html && diff -q amcm/index.html public/amcm/index.html
npx wrangler pages deploy public --project-name=richapps --branch=main

# Worker 部署（改 worker/amcm-api/src/index.js 后）
cd E:/RichAPP/richapps/worker/amcm-api && npx wrangler deploy

# Cron 手动触发（验证同步+摘要）
curl "https://amcm-api.ifcmacao.workers.dev/api/cron/run?token=<ADMIN_TOKEN>"

# D1 查询/导入
npx wrangler d1 execute amcm-db --remote --command "SELECT ..."   # 加 --file=xx.sql 导入
```

## 五、已知限制与风险

1. **D1 免费档读配额**：全库 FTS 查询偏重，审计/大批量验证当日易触顶（UTC 午夜重置）。如用户量增长建议付费档或为 FTS 查询加 LIMIT 策略（已做 500 行上限）。
2. **Cron 匹配语义**：官方行带文号必须精确匹配；无文号行才允许标题回落。唯一索引是最后防线，但 Worker 日志的 added>0 应人工核对是否真新增。
3. **待人工事项**：凭据轮换（M1.5 清单，优先 D1/Workers Token）；阅读器交互人工点验；gid76 清洗复核；preM2 备份异地副本。
4. **keystore**：密钥 android（弱），上架商店前必须重建强密钥。

## 六、里程碑历史

- M0（审计）：发现 2 项 P0（v3.1 未上线、cron 数据污染）
- M1：cron 匹配键修复、8 行效力链修复、v3.1 正式上线
- M1.5/M1.6：只读核对、preM2 备份、Worker 纳入 Git
- M2：正文补齐（无文本 7→0）、噪声清洗（872 chunk）、搜索去重+分页、17 条重复治理、唯一索引、页码跳转
