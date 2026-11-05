/**
 * AMCM 指引通 API v3
 * 路由:
 *  GET  /api/stats
 *  GET  /api/guidelines?sector=&category=&status=&q=&sort=&page=&size=
 *  GET  /api/guidelines/:id
 *  GET  /api/search?q=&locale=&limit=
 *  GET  /api/news?limit=
 *  POST /api/subscribe          {email, sectors}
 *  GET  /api/confirm-subscription?token=
 *  GET  /api/unsubscribe?token=
 *  GET  /api/cron/run?token=    手動觸發同步+摘要（需 ADMIN_TOKEN）
 * Cron:
 *  每日 23:00 UTC（澳門時間 07:00）增量同步 AMCM 官網 → D1，並向已確認訂閱者群發摘要郵件
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=120",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}
const err = (msg, status = 400) => json({ ok: false, error: msg }, status);

function htmlPage(title, bodyHtml) {
  return new Response(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,"Segoe UI","Noto Sans HK","Microsoft JhengHei",sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,.08);
padding:40px 48px;max-width:460px;text-align:center}
h1{color:#0f172a;font-size:20px;margin:0 0 12px}p{color:#475569;font-size:14px;line-height:1.8;margin:0 0 20px}
.ok{font-size:44px}a{color:#d97706;font-weight:700;text-decoration:none}</style></head>
<body><div class="card">${bodyHtml}</div></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
  });
}

const UUID = () => crypto.randomUUID();
const SITE = "https://richapps.pages.dev/amcm/";

async function resendSend(env, to, subject, html) {
  const from = env.SENDER_EMAIL || "AMCM 指引通 <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return r.ok;
}

/* ================= Cron：每日增量同步 + 摘要群發 ================= */
const AMCM_SOURCES = [
  ["BANKING", "https://www.amcm.gov.mo/api/v1.0/cms/laws?slug=notices-and-guidelines", "notices-and-guidelines"],
  ["INSURANCE", "https://www.amcm.gov.mo/api/v1.0/cms/laws?slug=notices-in-force-from-amcm", "notices-in-force-from-amcm"],
];
const DOCN = /(\d{3}\/\d{4}(?:-[A-Z]{3,4})?|\d{3}\/\d{4})/;
const YEARM = /\/(\d{4})/;
/* 正規化：去空白、統一大小寫/括號/連字號，並剝離標題內嵌的文號後綴（官方標題常帶「（第 X/Y-Z 號）」） */
const normT = (t) => (t || "")
  .replace(/[（(]\s*第[^）)]*[號号]\s*[）)]/g, "")
  .replace(/[\s\u3000]+/g, "")
  .replace(/[（）﹙﹚]/g, m => ({ "（": "(", "）": ")", "﹙": "(", "﹚": ")" }[m]))
  .replace(/[–—－]/g, "-")
  .toUpperCase();
/* 文號正規化：統一大小寫與連字號，去掉可能的空白 */
const normDoc = (d) => (d || "").replace(/[\s]+/g, "").replace(/[–—－]/g, "-").toUpperCase();
/* upsert 匹配鍵：有文號 → sector+normTitle+normDoc；無文號 → sector+normTitle（無文號行無版本差異依據） */
function matchKey(r) {
  const t = normT(r.title_tc) || normT(r.title_en);
  return r.doc_number
    ? `${r.sector}|${t}|${normDoc(r.doc_number)}`
    : `${r.sector}|${t}|NODOC`;
}

async function d1EnsureSchema(env) {
  const stmts = [
    "CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY, value TEXT)",
    "ALTER TABLE guidelines ADD COLUMN doc_year INTEGER",
    "ALTER TABLE guidelines ADD COLUMN status TEXT DEFAULT 'IN_FORCE'",
    "ALTER TABLE guidelines ADD COLUMN superseded_by TEXT",
    "ALTER TABLE guidelines ADD COLUMN subcategory TEXT",
    "ALTER TABLE guidelines ADD COLUMN first_seen TEXT",
  ];
  for (const s of stmts) {
    try { await env.DB.prepare(s).run(); } catch (e) { /* 已存在则忽略 */ }
  }
  await env.DB.prepare(
    "INSERT INTO sync_state(key,value) VALUES('last_sync_at','never') ON CONFLICT(key) DO NOTHING"
  ).run();
}

async function amcmFetchJson(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "RichappsAmcmWorker/3.0" } });
  if (!r.ok) throw new Error(`AMCM ${r.status} ${url}`);
  return (await r.json()).data;
}

/* 同步指引元数据（不处理 PDF 文本——文本抽取仍由本机 ETL 完成） */
async function syncGuidelines(env) {
  const rows = [];
  for (const [sector, api, slug] of AMCM_SOURCES) {
    const d = await amcmFetchJson(api);
    const items = d.data || d;
    const walk = (list, cat, subcat, inherited) => {
      for (const it of list || []) {
        const title = it.title;
        const kids = it.children || [];
        const tr = {};
        for (const t of it.translations || []) tr[t.locale] = t;
        const hasPdf = (it.translations || []).some((t) => t.pdf) || it.pdf || it.url;
        if (kids.length) walk(kids, cat || title, cat ? title : null, title || inherited);
        if (hasPdf) {
          const summary = it.summary || "";
          const m = summary.match(DOCN);
          const dn = m ? m[1] : null;
          const ym = dn ? dn.match(YEARM) : null;
          rows.push({
            sector,
            category: cat || "未分類",
            subcategory: subcat,
            title_tc: (tr.zh_TW && tr.zh_TW.title) || title || inherited || "",
            title_en: (tr.en && tr.en.title) || title || "",
            doc_number: dn,
            doc_year: ym ? parseInt(ym[1]) : null,
            summary,
            pdf_tc: it.pdf || (tr.zh_TW && tr.zh_TW.pdf) || null,
            pdf_zh_cn: (tr.zh_CN && tr.zh_CN.pdf) || null,
            pdf_pt: (tr.pt_PT && tr.pt_PT.pdf) || it.pdf || null,
            pdf_en: (tr.en && tr.en.pdf) || null,
            url: it.url || null,
            page_slug: slug,
          });
        }
      }
    };
    walk(items, null, null, null);
  }
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  let added = 0, updated = 0;
  const newOnes = [];
  const stmts = [];
  /* 全量載入既有記錄，在內存建立匹配索引（避免 N 次查詢且可控匹配語義） */
  const existing = await env.DB.prepare(
    "SELECT id, sector, title_tc, title_en, category, doc_number, doc_year, summary, status, superseded_by FROM guidelines"
  ).all();
  const index = new Map();
  const titleIndex = new Map(); // 二級索引：sector|normTitle → 任一版本（用於文號缺失時的回落匹配）
  for (const ex of existing.results) {
    const key = matchKey({
      sector: ex.sector, title_tc: ex.title_tc, title_en: ex.title_en,
      category: ex.category, doc_number: ex.doc_number,
    });
    if (!index.has(key)) index.set(key, ex);
    const tk = `${ex.sector}|${normT(ex.title_tc) || normT(ex.title_en)}`;
    if (!titleIndex.has(tk)) titleIndex.set(tk, ex);
  }
  for (const r of rows) {
    const key = matchKey(r);
    let ex = index.get(key);
    if (!ex && !r.doc_number) {
      /* 回落僅限「官方行無文號」：官方漏標文號時按同標題合併；
         官方行帶文號但精確鍵不匹配 → 一律視為新文件（嚴禁合併進舊條目改寫其身份） */
      const tk = `${r.sector}|${normT(r.title_tc) || normT(r.title_en)}`;
      ex = titleIndex.get(tk);
    }
    if (!ex) {
      stmts.push(env.DB.prepare(
        `INSERT INTO guidelines(sector,category,subcategory,title_tc,title_en,doc_number,doc_year,summary,status,first_seen,pdf_tc,pdf_zh_cn,pdf_pt,pdf_en,url,page_slug)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'IN_FORCE',?9,?10,?11,?12,?13,?14,?15)`
      ).bind(r.sector, r.category, r.subcategory, r.title_tc, r.title_en, r.doc_number, r.doc_year,
             r.summary, now, r.pdf_tc, r.pdf_zh_cn, r.pdf_pt, r.pdf_en, r.url, r.page_slug));
      added++; newOnes.push(r);
      index.set(key, { id: -1 }); // 本輪內防重複插入
      titleIndex.set(`${r.sector}|${normT(r.title_tc) || normT(r.title_en)}`, { id: -1 });
    } else if (ex.id > 0 && (ex.summary !== r.summary || String(ex.doc_year ?? "") !== String(r.doc_year ?? ""))) {
      /* 僅更新確屬同一版本的描述性欄位；嚴禁改動 doc_number/doc_year 本身（版本身份不可變）；
         回落合併（官方行無文號、原行有文號）時保留原行 summary——其含文號身份信息，價值高於官方空值 */
      if (!(r.doc_number == null && ex.doc_number != null)) {
        stmts.push(env.DB.prepare(
          `UPDATE guidelines SET category=?2, summary=?3, pdf_tc=?4, pdf_zh_cn=?5, pdf_pt=?6, pdf_en=?7, url=?8 WHERE id=?1`
        ).bind(ex.id, r.category, r.summary, r.pdf_tc, r.pdf_zh_cn, r.pdf_pt, r.pdf_en, r.url));
        updated++;
      }
    }
  }
  /* 原子批量執行：全部成功或全部回滾，杜絕「半途失敗留下部分寫入」 */
  if (stmts.length) await env.DB.batch(stmts);
  /* 效力鏈推導（保守規則）：
     - 僅當同 sector + 同 norm(title) 分組內存在「文號不同、可解析年份且年份嚴格不同」的記錄時才推導；
     - 最新年份 = IN_FORCE；更舊年份 = SUPERSEDED → 指向最新文號；
     - 同 doc_number（同版本多行）不建立取代關係；
     - 年份缺失或相等（無法確認新舊）→ 不推導，保持現狀。 */
  const all = await env.DB.prepare("SELECT id,sector,title_tc,doc_number,doc_year FROM guidelines").all();
  const groups = new Map();
  for (const g of all.results) {
    if (!g.doc_number) continue; // 無文號不參與推導
    const k = g.sector + "|" + normT(g.title_tc);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  let supersededNew = 0;
  for (const grp of groups.values()) {
    const byYear = new Map();
    for (const g of grp) {
      const y = g.doc_year || 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(g);
    }
    const years = [...byYear.keys()].filter((y) => y > 0);
    if (years.length < 2) continue; // 年份缺失/相同 → 無法確認關係，不自動推導
    const newestYear = Math.max(...years);
    const newestDocs = byYear.get(newestYear);
    const newestNum = normDoc(newestDocs[0].doc_number);
    if (!newestNum) continue;
    for (const y of years) {
      if (y === newestYear) continue;
      for (const old of byYear.get(y)) {
        if (normDoc(old.doc_number) === newestNum) continue; // 同編號：同版本，不互指
        const r = await env.DB.prepare(
          "UPDATE guidelines SET status='SUPERSEDED', superseded_by=?2 WHERE id=?1 AND status!='SUPERSEDED'"
        ).bind(old.id, newestDocs[0].doc_number).run();
        supersededNew += r.meta.changes;
      }
    }
  }
  return { total: rows.length, added, updated, supersededNew, newTitles: newOnes.map((n) => `${n.sector === "BANKING" ? "銀行" : "保險"} · ${n.title_tc}${n.doc_number ? `（第 ${n.doc_number} 號）` : ""}`) };
}

/* 同步最新動態 */
async function syncNews(env) {
  const d = await amcmFetchJson("https://www.amcm.gov.mo/api/v1.0/news/home_news");
  let added = 0;
  const newTitles = [];
  for (const blk of d.items || []) {
    const cat = blk.title, catSlug = blk.slug;
    for (const it of blk.data || []) {
      if (it.id == null) continue;
      const title = (it.title || "").trim();
      const published = (it.inputAt || "").slice(0, 10);
      const nid = String(it.id);
      const ex = await env.DB.prepare("SELECT id FROM news WHERE nid=?1").bind(nid).first();
      if (!ex) {
        await env.DB.prepare(
          "INSERT INTO news(nid,cat_slug,cat_title,title,slug,published,fetched_at) VALUES(?1,?2,?3,?4,?5,?6,datetime('now'))"
        ).bind(nid, catSlug, cat, title, it.slug, published).run();
        added++; newTitles.push(title);
      }
    }
  }
  return { added, newTitles };
}

/* 摘要群發（Double Opt-in 已確認訂閱者，按行業過濾） */
async function sendDigest(env, syncG, syncN) {
  if (!syncG.added && !syncN.added) return { sent: 0, skipped: "無新增內容" };
  const subs = await env.DB.prepare(
    "SELECT email, sectors FROM email_subscribers WHERE is_confirmed=1"
  ).all();
  if (!subs.results.length) return { sent: 0, skipped: "無已確認訂閱者" };
  const gItems = syncG.newTitles.map((t) => `<li style="margin-bottom:6px">🆕 ${t}</li>`).join("");
  const nItems = syncN.newTitles.slice(0, 10).map((t) => `<li style="margin-bottom:6px">📰 ${t}</li>`).join("");
  const today = new Date().toISOString().slice(0, 10);
  const html = `<div style="font-family:-apple-system,'Segoe UI','Noto Sans HK',sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<div style="background:#0f172a;color:#f59e0b;padding:22px 24px"><h1 style="margin:0;font-size:18px">AMCM 指引通 · 每日監管動態</h1>
<p style="color:#94a3b8;font-size:12px;margin:6px 0 0">${today} · 自動同步自澳門金融管理局官網</p></div>
<div style="padding:24px;color:#334155;font-size:14px;line-height:1.8">
${gItems ? `<h3 style="color:#0f172a;font-size:15px">🆕 新增/更新指引（${syncG.newTitles.length}）</h3><ul style="padding-left:20px">${gItems}</ul>` : ""}
${nItems ? `<h3 style="color:#0f172a;font-size:15px">📰 最新動態（${syncN.newTitles.length}）</h3><ul style="padding-left:20px">${nItems}</ul>` : ""}
<p style="text-align:center;margin:24px 0"><a href="${SITE}" style="background:#d97706;color:#fff;padding:11px 30px;border-radius:8px;text-decoration:none;font-weight:700">前往 AMCM 指引通查看全文</a></p>
<p style="color:#94a3b8;font-size:12px">本郵件僅為自動摘要，一切以 AMCM 官方發佈為準。</p>
</div></div>`;
  let sent = 0;
  for (const s of subs.results) {
    const sec = (s.sectors || "ALL").split(",");
    const gRel = syncG.newTitles.some((t) => sec.includes("ALL") || (sec.includes("BANKING") && t.startsWith("銀行")) || (sec.includes("INSURANCE") && t.startsWith("保險")));
    if (syncG.added && !gRel && !syncN.added) continue; // 行業不符且無新聞則跳過
    const ok = await resendSend(env, s.email, `[AMCM 指引通] ${today} 監管動態摘要`, html);
    if (ok) sent++;
  }
  return { sent };
}

async function runCron(env) {
  await d1EnsureSchema(env);
  const log = { started: new Date().toISOString() };
  try { log.guidelines = await syncGuidelines(env); } catch (e) { log.guidelinesError = String(e).slice(0, 300); }
  try { log.news = await syncNews(env); } catch (e) { log.newsError = String(e).slice(0, 300); }
  try { log.digest = await sendDigest(env, log.guidelines || { added: 0, newTitles: [] }, log.news || { added: 0, newTitles: [] }); } catch (e) { log.digestError = String(e).slice(0, 300); }
  await env.DB.prepare(
    "INSERT INTO sync_state(key,value) VALUES('last_sync_at',?1) ON CONFLICT(key) DO UPDATE SET value=?1"
  ).bind(new Date().toISOString()).run();
  log.finished = new Date().toISOString();
  return log;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    const url = new URL(request.url);
    const p = url.pathname;
    const q = (k, d) => url.searchParams.get(k) ?? d;

    try {
      // ================= stats =================
      if (p === "/api/stats") {
        const r = await env.DB.prepare(
          `SELECT (SELECT COUNT(*) FROM guidelines) AS guidelines,
                  (SELECT COUNT(*) FROM guidelines WHERE status='SUPERSEDED') AS superseded,
                  (SELECT COUNT(*) FROM chunks) AS pages,
                  (SELECT COUNT(*) FROM chunks WHERE is_ocr=2) AS ocr_pages,
                  (SELECT COUNT(*) FROM chunks WHERE is_machine_translated=1) AS mt_pages,
                  (SELECT COUNT(*) FROM news) AS news`
        ).first();
        return json({ ok: true, data: r });
      }

      // ================= news =================
      if (p === "/api/news") {
        const limit = Math.min(parseInt(q("limit", "30")), 100);
        const r = await env.DB.prepare(
          "SELECT nid,cat_slug,cat_title,title,slug,published FROM news ORDER BY published DESC LIMIT ?1"
        ).bind(limit).all();
        const events = r.results.map(n => {
          let type = "監管新聞";
          const t = n.cat_title || "";
          if (/新聞|news/i.test(t)) type = "監管新聞";
          else if (/統計/.test(t)) type = "統計發布";
          else if (/通知|公告/.test(t)) type = "通知公告";
          else if (/違規|處罰/.test(t)) type = "文件廢止";
          return { ...n, event_type: type };
        });
        return json({ ok: true, data: events });
      }

      // ================= guidelines list =================
      if (p === "/api/guidelines") {
        const sector = q("sector"), category = q("category"), status = q("status");
        const term = (q("q") || "").trim();
        const sort = q("sort", "date_desc");
        const page = Math.max(parseInt(q("page", "1")), 1);
        const size = Math.min(parseInt(q("size", "50")), 200);
        const conds = [], binds = [];
        if (sector) { conds.push("sector = ?"); binds.push(sector); }
        if (category) { conds.push("category = ?"); binds.push(category); }
        if (status) { conds.push("status = ?"); binds.push(status); }
        if (term) {
          conds.push("(title_tc LIKE ? OR title_en LIKE ? OR title_pt LIKE ? OR doc_number LIKE ? OR summary LIKE ?)");
          const like = `%${term}%`;
          binds.push(like, like, like, like, like);
        }
        const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
        const orderBy = {
          date_desc: "doc_year IS NULL, doc_year DESC, id ASC",
          date_asc: "doc_year IS NULL, doc_year ASC, id ASC",
          number_asc: "doc_number IS NULL, doc_number ASC",
          number_desc: "doc_number IS NULL, doc_number DESC",
          status: "status ASC, doc_year IS NULL, doc_year DESC",
        }[sort] || "doc_year IS NULL, doc_year DESC, id ASC";
        const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM guidelines ${where}`).bind(...binds).first();
        const rows = await env.DB.prepare(
          `SELECT id,sector,category,subcategory,title_tc,title_en,doc_number,doc_year,summary,status,superseded_by,
                  pdf_tc,pdf_zh_cn,pdf_pt,pdf_en,url,page_slug,
                  (SELECT COUNT(*) FROM chunks c WHERE c.guideline_id=guidelines.id) AS pages,
                  (SELECT MAX(c.is_ocr) FROM chunks c WHERE c.guideline_id=guidelines.id) AS has_ocr,
                  (SELECT MAX(c.is_machine_translated) FROM chunks c WHERE c.guideline_id=guidelines.id) AS has_mt
           FROM guidelines ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
        ).bind(...binds, size, (page - 1) * size).all();
        const cats = await env.DB.prepare(
          "SELECT DISTINCT sector, category FROM guidelines WHERE category IS NOT NULL ORDER BY sector, category"
        ).all();
        return json({ ok: true, total: total.n, page, size, categories: cats.results, data: rows.results });
      }

      // ================= guideline detail =================
      const m = p.match(/^\/api\/guidelines\/(\d+)$/);
      if (m) {
        const id = parseInt(m[1]);
        const g = await env.DB.prepare("SELECT * FROM guidelines WHERE id = ?1").bind(id).first();
        if (!g) return err("not found", 404);
        const chunks = await env.DB.prepare(
          "SELECT id,locale,page_number,content,is_ocr,ocr_confidence,is_machine_translated,needs_review FROM chunks WHERE guideline_id = ?1 ORDER BY locale, page_number"
        ).bind(id).all();
        return json({ ok: true, data: { ...g, chunks: chunks.results } });
      }

      // ================= search =================
      if (p === "/api/search") {
        const term = (q("q") || "").trim();
        if (!term) return err("missing q");
        const locale = q("locale");
        const status = q("status");
        const limit = Math.min(parseInt(q("limit", "20")), 50);
        const phraseOf = (w) =>
          /^[\u3400-\u9fff\uf900-\ufaff]+$/.test(w)
            ? '"' + w.split("").join(" ") + '"'
            : `"${w.replace(/"/g, '""')}"*`;
        const match = term.split(/\s+/).filter(Boolean).map(phraseOf).join(" AND ");
        let conds = "WHERE chunks_fts MATCH ?1";
        const binds = [match];
        let bindIdx = 2;
        if (locale) { conds += ` AND f.locale = ?${bindIdx++}`; binds.push(locale); }
        if (status) { conds += ` AND g.status = ?${bindIdx++}`; binds.push(status); }
        binds.push(limit);
        const r = await env.DB.prepare(
          `SELECT f.guideline_id AS gid, f.page_number, f.locale, f.content,
                  snippet(chunks_fts, 0, '<mark>', '</mark>', '…', 40) AS snip,
                  g.title_tc, g.doc_number, g.sector, g.category, g.status, g.superseded_by,
                  g.pdf_tc, g.pdf_pt, g.pdf_en, g.url
           FROM chunks_fts f JOIN guidelines g ON g.id = f.guideline_id
           ${conds} ORDER BY rank LIMIT ?${bindIdx}`
        ).bind(...binds).all();
        const cnt = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM chunks_fts f JOIN guidelines g ON g.id = f.guideline_id ${conds}`
        ).bind(...binds.slice(0, -1)).first();
        return json({ ok: true, total: cnt.n, data: r.results });
      }

      // ================= subscribe =================
      if (p === "/api/subscribe" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        const email = (body?.email || "").trim().toLowerCase();
        const sectors = Array.isArray(body?.sectors) && body.sectors.length ? body.sectors.join(",") : "ALL";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("請輸入有效的電子郵箱");
        const confirmToken = UUID(), unsubToken = UUID();
        await env.DB.prepare(
          `INSERT INTO email_subscribers(email,sectors,is_confirmed,confirm_token,unsub_token)
           VALUES(?1,?2,0,?3,?4)
           ON CONFLICT(email) DO UPDATE SET sectors=?2, confirm_token=?3, unsub_token=?4, is_confirmed=0`
        ).bind(email, sectors, confirmToken, unsubToken).run();
        const link = `${SITE}confirm-subscription?token=${confirmToken}`;
        const html = `<div style="font-family:-apple-system,'Segoe UI','Noto Sans HK',sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<div style="background:#0f172a;color:#f59e0b;padding:24px;text-align:center"><h1 style="margin:0;font-size:18px">AMCM 指引通</h1><p style="color:#94a3b8;font-size:12px;margin:6px 0 0">澳門金融監管指引資料庫</p></div>
<div style="padding:28px"><p style="color:#0f172a;font-size:15px">您好！請確認您的訂閱請求：</p>
<p style="color:#475569;font-size:14px">點擊下方按鈕完成訂閱「AMCM 指引通」最新監管動態。若您沒有發起過此請求，請忽略本郵件。</p>
<p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#d97706;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700">✓ 確認訂閱</a></p>
<p style="color:#94a3b8;font-size:12px">或複製鏈接到瀏覽器打開：<br>${link}</p></div>
<div style="background:#f8fafc;padding:14px;text-align:center;color:#94a3b8;font-size:11px">本郵件由 AMCM 指引通發送 · 以 AMCM 官方發佈為準</div></div>`;
        const sent = await resendSend(env, email, "[AMCM 指引通] 請確認您的訂閱（Double Opt-in）", html);
        return json({ ok: true, sent, message: sent ? "確認郵件已發送，請查收並點擊確認連結。" : "已登記，但確認郵件發送受限（發信域名待驗證）。" });
      }

      if (p === "/api/confirm-subscription") {
        const token = q("token");
        const r = await env.DB.prepare(
          "UPDATE email_subscribers SET is_confirmed=1, confirmed_at=datetime('now') WHERE confirm_token=?1 AND is_confirmed=0"
        ).bind(token).run();
        if (r.meta.changes === 0) return htmlPage("訂閱確認", `<div class="ok">⚠️</div><h1>確認失敗</h1><p>連結無效或已使用過。</p><a href="${SITE}">返回 AMCM 指引通</a>`);
        return htmlPage("訂閱確認", `<div class="ok">🟢</div><h1>訂閱成功！</h1><p>您的郵箱已通過驗證，此後將收到 AMCM 指引通的最新監管動態摘要。</p><a href="${SITE}">返回 AMCM 指引通</a>`);
      }

      if (p === "/api/unsubscribe") {
        const token = q("token");
        const r = await env.DB.prepare("DELETE FROM email_subscribers WHERE unsub_token=?1").bind(token).run();
        if (r.meta.changes === 0) return htmlPage("退訂", `<div class="ok">⚠️</div><h1>退訂失敗</h1><p>連結無效或您已退訂。</p><a href="${SITE}">返回 AMCM 指引通</a>`);
        return htmlPage("退訂", `<div class="ok">✅</div><h1>已成功退訂</h1><p>您已成功退訂 AMCM 指引通最新動態，我們已永久刪除您的郵箱數據。</p><a href="${SITE}">返回 AMCM 指引通</a>`);
      }

      // ================= 手動觸發 Cron 同步 =================
      if (p === "/api/cron/run") {
        const token = q("token");
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return err("unauthorized", 401);
        const log = await runCron(env);
        return json({ ok: true, log });
      }

      return err("unknown route", 404);
    } catch (e) {
      return json({ ok: false, error: String(e).slice(0, 300) }, 500);
    }
  },
};