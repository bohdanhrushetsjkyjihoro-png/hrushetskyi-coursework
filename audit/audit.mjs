// Аудит доступності: axe-core (3 ширини) + Lighthouse accessibility (3 повтори, mobile і desktop)
// Використання: node audit.mjs <label> <outDir>
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import lighthouse from "lighthouse";

const [, , label = "before", outDir = "./results"] = process.argv;
// Шлях до Chrome: на Windows задайте CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PAGES = {
  "shop-index": "http://localhost:8081/index.html",
  "shop-news": "http://localhost:8081/news.html",
  "autoshop-index": "http://localhost:8082/index.html",
};
const WIDTHS = [360, 768, 1280];
const RUNS = 3;
const axeSource = fs.readFileSync(
  new URL("./node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const dir = path.join(outDir, label);
fs.mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--remote-debugging-port=9333"],
});

const summary = { label, date: new Date().toISOString(), axe: {}, lighthouse: {} };

for (const [name, url] of Object.entries(PAGES)) {
  summary.axe[name] = {};
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(axeSource);
    const res = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
        },
        resultTypes: ["violations", "incomplete"],
      }),
    );
    fs.writeFileSync(path.join(dir, `axe_${name}_${width}.json`), JSON.stringify(res, null, 2));
    summary.axe[name][width] = {
      violations: res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        tags: v.tags.filter((t) => /^wcag\d|best/.test(t)),
        nodes: v.nodes.length,
        help: v.help,
      })),
      incomplete: res.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })),
    };
    await page.close();
  }

  summary.lighthouse[name] = { mobile: [], desktop: [] };
  for (const formFactor of ["mobile", "desktop"]) {
    for (let i = 0; i < RUNS; i++) {
      const config = {
        extends: "lighthouse:default",
        settings: {
          onlyCategories: ["accessibility", "performance", "best-practices", "seo"],
          formFactor,
          screenEmulation:
            formFactor === "desktop"
              ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
              : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
          throttlingMethod: "simulate",
        },
      };
      const r = await lighthouse(url, { port: 9333, output: "json", logLevel: "error" }, config);
      const lhr = r.lhr;
      if (i === 0)
        fs.writeFileSync(path.join(dir, `lh_${name}_${formFactor}.json`), JSON.stringify(lhr));
      const failed = Object.values(lhr.audits)
        .filter(
          (a) =>
            lhr.categories.accessibility.auditRefs.some((ref) => ref.id === a.id) &&
            a.score === 0,
        )
        .map((a) => a.id);
      summary.lighthouse[name][formFactor].push({
        accessibility: Math.round(lhr.categories.accessibility.score * 100),
        performance: Math.round(lhr.categories.performance.score * 100),
        bestPractices: Math.round(lhr.categories["best-practices"].score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        failedA11yAudits: failed,
      });
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, (k, v) => (k === "tags" ? undefined : v), 1));
