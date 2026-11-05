# 「AMCM 指引通」开发需求文档 v2.1（决策确认稿）

| 项目 | 内容 |
|---|---|
| 版本 | v2.1（在 v2.0 规格书基础上融合用户决策，**本文件为唯一有效需求**） |
| 日期 | 2026-11-05 |
| 包名 / 路径 | `com.richapps.amcm` / `richapps.pages.dev/amcm/` |
| 状态 | 决策已齐备，可开工 M1 |

> 基础规格沿用《v2.0 规格书》（`amcm_app_v2_0.md`）：数据流水线、D1 Schema、BYOK AI 问答、System Prompt 铁律、UI 规范、验收标准均以 v2.0 为准；本文档记录 v2.0 评审后的**全部决策与修正**，冲突处以本文档为准。

---

## 1. 已确认决策（2026-11-05）

| # | 事项 | 决策 |
|---|---|---|
| D1 | 邮件发送引擎 | **Resend**，API Key 已提供并验证有效（测试邮件已送达 ifcmacao@gmail.com）。Key 存放于本机环境配置，不写入代码仓库 |
| D2 | 机器翻译引擎 | **方案 A**：无中文版指引由本机 ETL 流水线调用用户 BYOK DeepSeek Key 翻译，DB 标注 `is_machine_translated: true`，前端显著标注"机器翻译件" |
| D3 | Android 系统级推送 | **接受降级**：首版 APK 用「启动时/定时轮询 + 本地通知」；PWA 与网页版用标准 **Web Push**（零第三方账号）；FCM 列二期 |
| D4 | Cloudflare 付费计划 | **不开通**。抓取与 OCR/翻译 ETL 均在本机执行，结果推送至 D1；运行稳定后用户再考虑付费云端化 |
| D5 | 验收基线修正 | 抓取完整性 = "首批全量导入后与官网列表 100% 一致，此后增量偏差 < 24 小时窗口" |
| D6 | 源文件合规 | 不存储 AMCM PDF 原文件（R2 仅存文本化结果与 OCR 中间产物）；下载一律 302 到 `cdn.amcm.gov.mo` |
| D7 | 语义检索 | 首版用 FTS5 + 同义词扩展支撑 RAG；Workers Vectorize 向量检索列二期 |
| D8 | BYOK 直连 | 浏览器直连 DeepSeek/OpenAI/Claude（加 `anthropic-dangerous-direct-browser-access` 头）/Ollama；Key 仅存客户端 |

## 2. 执行架构（按 D4 修正后的实际形态）

```
【本机 ETL（Windows, E:/RichAPP）】
  fetch 脚本：AMCM SPA 逆向(首选)/DOM 解析 → 指引元数据
  PDF 文本化：文字型→pdfplumber/PyMuPDF；扫描型→PaddleOCR(置信度标注)
  翻译：DeepSeek Key（D2）→ 中文机翻对照
        │ 推送(REST API)
        ▼
【Cloudflare 免费档】
  D1(amcm-db)：guidelines / guideline_chunks / guideline_fts(FTS5)
               / guideline_versions / email_subscribers
  Worker API：列表/详情/检索/订阅/推送触发
  Cron Trigger：每日 02:00 调用本机? ✗ → 改为：本机 Windows 任务计划每日执行 ETL
               Worker 端仅提供数据接口；变更检测由本机 ETL 完成
               （付费云端化后再迁移 Cron）
  Pages：网页版 H5 + PWA（Web Push）
        │
  Resend：订阅摘要邮件（D1）
        │
【Android APK】WebView 壳 + 轮询本地通知（D3），无 Gradle 构建链打包
```

## 3. 待办与依赖（用户侧）

| # | 待办 | 阻塞点 | 优先级 |
|---|---|---|---|
| T1 | Resend 验证发信域名（建议 `gejw.top`，后台加 3 条 DNS 记录） | 不验证则订阅邮件**只能发给 Resend 账号邮箱本人**，无法触达任意订阅者 | P0（M3 前） |
| T2 | 提供 DeepSeek API Key（仅本机 ETL 使用，不入仓库） | M1 全量导入时即需翻译 | P0（M1 前） |
| T3 | 日常 ETL 依赖本机开机 | 本机不运行的日期，官网更新会延迟入库（<24h 验收基线失效） | 提示知悉 |

## 4. 里程碑（不变，按新架构执行）

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1 | 数据验证：SPA 逆向/抓取；全量导入；PDF 文本化覆盖率报告（含 OCR 抽样质量） | D1 指引库 v1 |
| M2 | Worker API + 网页版 H5（指引大厅/动态/全文检索/版本/效力/收藏/阅读器） | richapps.pages.dev/amcm 上线 |
| M3 | Resend 订阅（Double Opt-in）+ Web Push + APK 轮询通知 | 三条触达通道 |
| M4 | BYOK AI 问答（RAG + 脚注铁律）+ 设置面板；APK/PWA 打包；门户页入口 | 全功能三端 |
| M5 | 二期：向量检索、修订 diff、FCM、OCR 校对台、标签订阅 | v1.1 |

## 5. 安全备忘

- Resend Key / DeepSeek Key：仅存本机环境变量或本地未入库配置文件；`.gitignore` 覆盖
- 撤销提醒：此前 GitHub PAT（richapptoken）与 Cloudflare Token 仍有效，任务间隙建议轮换
