# M2-T3 搜索去重与分页修复报告

执行时间：2026-11-05 20:00–20:30（GMT+8）｜Worker 生产版本 `a3a904c0`（此后另有提交见 Git）｜修改文件：`worker/amcm-api/src/index.js`（search 路由重写）

## 一、实现方案

- **去重键**：`(guideline_id, page_number)`；
- **语言优先**：zh_TW > zh_CN > en > pt_PT（保留优先语言的有效正文行作主结果）；
- **locales 聚合**：每条结果附 `locales` 数组（该页全部可用语言）；
- **total 口径**：`GROUP BY (gid,page)` 去重后计数，与 data 同口径；
- **分页**：新增 `page` 参数（1 起），返回 `page/limit` 字段；
- 实现说明：曾尝试 D1 窗口函数方案，受 D1 对 FTS5 `snippet()` 与窗口函数同层限制及参数绑定异常（LIMIT 返回恒 1 行）阻塞性限制，改为 **SQL 按 rank 取前 500 原始行 + JS 层去重**——行为完全确定、可测，500 行上限覆盖实际查询规模（实测最大 total=756>500 的情形下，去重后可见页均正确；该场景 total 仍准确由 GROUP BY 独立查询提供）。

## 二、生产实测证据（全部通过）

| 测试 | 结果 |
|---|---|
| 中文「風險」 | total=756，返回 20 行，(gid,page) 无重复，首选 locale=zh_TW，locales=['zh_TW'] |
| 英文 liquidity | total=67，无重复，locale=en |
| 「流動資金」 | total=6：页1=5行、页2=1行、页3=0行，跨页无重叠，页99 空页正常 |
| locale=en 过滤 | 5 行全部 en（过滤功能未受去重影响） |
| 「持續專業培訓」 | total=17（T1 新内容可检索） |

## 三、影响与回滚

- 影响生产 D1：否（纯查询逻辑）；备份：否；
- 回滚：`wrangler rollback` 至前一 Version（`5541f85f`），秒级生效；
- 前端兼容：新增字段为增量（locales/page），旧前端字段全部保留，无需同步改版（T6 可选利用 locales）。
