// Manual verification for functions/webUtils.js crawlSite - plain Node +
// assert, no network: global fetch is replaced by a fake that reproduces
// the real structure of hagarlushi.com as observed on 2026-10-07:
//   - hagarlushi.com redirects to www.hagarlushi.com
//   - /sitemap.xml is a sitemap INDEX on the www host, pointing at
//     pages-sitemap.xml / portfolio-*-sitemap.xml
//   - page slugs are Hebrew; there are utility pages (thankyou,
//     coming-soon, copy-of-..., accessibility statement)
// Run with: node functions/test/crawlSite.manualTest.js

const assert = require("assert");
const path = require("path");
const cheerio = require(require.resolve("cheerio", { paths: [path.join(__dirname, "..")] }));
const { crawlSite } = require(path.join(__dirname, "..", "webUtils.js"));

const W = "https://www.hagarlushi.com";
const enc = (p) => encodeURI(`${W}${p}`);

const homepageHtml = `<html><head><title>Hagar Lushi</title></head><body>
  <header><nav>
    <a href="/">בית</a>
    <a href="${enc("/לקוחות-פרטיים")}">פרטיים</a>
    <a href="${enc("/מסחריים")}">מסחריים</a>
    <a href="${enc("/אודות")}">אודות</a>
    <a href="https://instagram.com/x">instagram</a>
    <a href="mailto:a@b.c">mail</a>
  </nav></header>
  <main><h1>סטודיו לאדריכלות ועיצוב פנים</h1></main></body></html>`;

const sitemapIndex = `<?xml version="1.0"?><sitemapindex>
  <sitemap><loc>${W}/portfolio-projects-sitemap.xml</loc></sitemap>
  <sitemap><loc>${W}/pages-sitemap.xml</loc></sitemap>
</sitemapindex>`;

const pagesSitemap = `<?xml version="1.0"?><urlset>
  <url><loc>${W}</loc></url>
  <url><loc>${W}/לקוחות-פרטיים</loc></url>
  <url><loc>${W}/מסחריים</loc></url>
  <url><loc>${W}/אודות</loc></url>
  <url><loc>${W}/thankyou</loc></url>
  <url><loc>${W}/coming-soon</loc></url>
  <url><loc>${W}/copy-of-יוניקורן</loc></url>
  <url><loc>${W}/הצהרתנגישות</loc></url>
  <url><loc>${W}/מנהל-הפרויקט</loc></url>
</urlset>`;

const projectsSitemap = `<?xml version="1.0"?><urlset>
  <url><loc>${W}/portfolio/בית-בקיסריה</loc></url>
</urlset>`;

const pageHtml = (title) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>תוכן העמוד ${title}</p></main></body></html>`;

const requested = [];
global.fetch = async (url) => {
  const decoded = decodeURI(url);
  requested.push(decoded);
  const respond = (body, finalUrl, type = "text/html") => ({
    ok: true,
    status: 200,
    url: finalUrl || url,
    headers: { get: () => type },
    text: async () => body
  });
  if (decoded === "https://hagarlushi.com" || decoded === "https://hagarlushi.com/") return respond(homepageHtml, `${W}/`);
  if (decoded === `${W}/sitemap.xml`) return respond(sitemapIndex, null, "application/xml");
  if (decoded === `${W}/pages-sitemap.xml`) return respond(pagesSitemap, null, "application/xml");
  if (decoded === `${W}/portfolio-projects-sitemap.xml`) return respond(projectsSitemap, null, "application/xml");
  if (decoded === `${W}/מנהל-הפרויקט`) return { ok: false, status: 500, url, headers: { get: () => "" }, text: async () => "" };
  if (decoded.startsWith(W)) return respond(pageHtml(decodeURI(new URL(url).pathname)));
  return { ok: false, status: 404, url, headers: { get: () => "" }, text: async () => "" };
};

// What the ORIGINAL crawler did: origin from the www-stripped domain, read
// only sitemap.xml <loc>s that start with that origin, else homepage only.
async function originalDiscover(origin) {
  const res = await global.fetch(`${origin}/sitemap.xml`);
  const xml = res.ok ? await res.text() : null;
  if (xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const locs = $("loc")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((u) => u.startsWith(origin));
    if (locs.length > 0) return locs;
  }
  return [origin];
}

async function main() {
  // The non-www sitemap path isn't served in this fake, mirroring that the
  // original code requested https://hagarlushi.com/sitemap.xml.
  const before = await originalDiscover("https://hagarlushi.com");
  assert.deepStrictEqual(before, ["https://hagarlushi.com"], "original crawler fell back to the homepage only");
  console.log("PASS: reproduced the original behavior - homepage only");

  requested.length = 0;
  const { pages, report } = await crawlSite("https://hagarlushi.com", cheerio);
  const urls = pages.map((p) => p.url);

  assert.strictEqual(report.siteHost, "hagarlushi.com");
  assert.ok(urls.includes(`${W}/לקוחות-פרטיים`), "inner client-type page fetched");
  assert.ok(urls.includes(`${W}/מסחריים`), "commercial page fetched");
  assert.ok(urls.includes(`${W}/אודות`), "about page fetched");
  assert.ok(urls.includes(`${W}/portfolio/בית-בקיסריה`), "project page from child sitemap fetched");
  assert.strictEqual(urls[0], `${W}/`, "homepage first, on the host the site redirects to");
  assert.ok(urls.indexOf(`${W}/לקוחות-פרטיים`) < urls.indexOf(`${W}/portfolio/בית-בקיסריה`), "homepage-linked pages before sitemap-only pages");
  assert.ok(!urls.some((u) => /instagram|mailto/.test(u)), "external links ignored");

  const skippedUrls = report.skipped.map((s) => s.url);
  for (const junk of ["thankyou", "coming-soon", "copy-of-יוניקורן", "הצהרתנגישות"]) {
    assert.ok(skippedUrls.some((u) => u.endsWith(junk)), `${junk} skipped with a reason`);
  }
  assert.ok(report.failed.some((f) => f.url.endsWith("מנהל-הפרויקט") && f.reason === "HTTP 500"), "failed fetch recorded with reason");
  assert.strictEqual(new Set(urls).size, urls.length, "no page fetched twice (www/non-www/trailing slash deduped)");
  assert.strictEqual(report.pagesFetched, pages.length);
  assert.ok(report.pagesDiscovered >= 10);

  console.log("PASS: crawl follows the www redirect and sitemap index, fetches inner pages, skips utility pages with reasons");
  console.log("\nCrawl report:", JSON.stringify({ ...report, fetchedUrls: urls }, null, 2));
  console.log("\nAll crawl checks passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
