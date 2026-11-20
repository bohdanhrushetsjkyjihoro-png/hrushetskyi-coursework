// Напівавтоматичні перевірки WCAG 2.2, яких не робить axe:
// 2.1.1 клавіатура, 2.4.7 видимий фокус, 2.4.11 фокус не перекрито, 2.5.8 розмір цілі,
// 1.4.10 reflow (320px), навігація на мобільному, 1.4.12 інтервали тексту, темна тема (axe)
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [, , label = "before", outDir = "./results"] = process.argv;
const PAGES = {
  "shop-index": "http://localhost:8081/index.html",
  "shop-news": "http://localhost:8081/news.html",
  "autoshop-index": "http://localhost:8082/index.html",
};
const axeSource = fs.readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const dir = path.join(outDir, label);
fs.mkdirSync(path.join(dir, "screens"), { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const out = {};

for (const [name, url] of Object.entries(PAGES)) {
  const r = (out[name] = {});
  // --- Клавіатура, фокус, перекриття фокусу (desktop 1280 і mobile 360)
  for (const width of [1280, 360]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await new Promise((s) => setTimeout(s, 500));
    const total = await page.evaluate(
      () =>
        [...document.querySelectorAll("a[href],button,input,textarea,select,[tabindex]")].filter((e) => {
          const st = getComputedStyle(e);
          return e.tabIndex >= 0 && st.visibility !== "hidden" && e.getClientRects().length > 0;
        }).length,
    );
    const steps = [];
    for (let i = 0; i < total + 2; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const st = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        // що лежить у центрі елемента: якщо не він сам — фокус перекрито
        const cx = rect.left + rect.width / 2, cy = rect.top + Math.min(rect.height / 2, 5);
        const top = document.elementFromPoint(cx, Math.max(cy, 0));
        const obscured = top && !(el === top || el.contains(top) || top.contains(el));
        const outline = st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0;
        const ring = st.boxShadow && st.boxShadow !== "none";
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute("aria-label") || el.name || "").trim().slice(0, 40),
          focusVisible: outline || ring,
          obscured: !!obscured,
          obscuredBy: obscured ? (top.closest("header") ? "header" : top.tagName) : null,
          w: Math.round(rect.width), h: Math.round(rect.height),
        };
      });
      if (info) steps.push(info);
    }
    r[`keyboard_${width}`] = {
      focusable: total,
      reached: new Set(steps.map((s) => s.tag + s.text)).size,
      noVisibleFocus: steps.filter((s) => !s.focusVisible).map((s) => `${s.tag}: ${s.text}`),
      obscured: steps.filter((s) => s.obscured).map((s) => `${s.tag}: ${s.text} (${s.obscuredBy})`),
    };
    await page.close();
  }

  // --- Розмір цілі 2.5.8 (≥24×24 або достатній відступ), навігація на 360, reflow 320
  for (const width of [360, 320]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800 });
    await page.goto(url, { waitUntil: "networkidle0" });
    const res = await page.evaluate(() => {
      const els = [...document.querySelectorAll("a[href],button,input,textarea")].filter((e) => e.getClientRects().length);
      const small = els
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 24 || r.height < 24)
        .map(({ e, r }) => `${e.tagName.toLowerCase()} "${(e.innerText || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      const nav = document.querySelector("header nav");
      const navLinks = nav ? [...nav.querySelectorAll("a")] : [];
      const visibleNav = navLinks.filter((a) => a.getClientRects().length && getComputedStyle(a).visibility !== "hidden").length;
      return {
        smallTargets: small,
        navLinksTotal: navLinks.length,
        navLinksVisible: visibleNav,
        hasMenuButton: !!document.querySelector("header button[aria-expanded]"),
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    r[`layout_${width}`] = res;
    if (width === 360) await page.screenshot({ path: path.join(dir, "screens", `${name}_360.png`) });
    await page.close();
  }

  // --- 1.4.12 інтервали тексту: чи щось обрізається
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle0" });
    const clipped = await page.evaluate(() => {
      const s = document.createElement("style");
      s.textContent = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
      document.head.append(s);
      return [...document.querySelectorAll("a,button,h1,h2,h3,p,span,label")]
        .filter((e) => {
          const st = getComputedStyle(e);
          return (st.overflow === "hidden" || st.textOverflow === "ellipsis") && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        })
        .map((e) => e.tagName + ": " + e.innerText.slice(0, 30));
    });
    r.textSpacingClipped = clipped;
    await page.close();
  }

  // --- Заголовки та імена кнопок
  {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    r.semantics = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => h.tagName + " " + h.innerText.trim().slice(0, 40));
      const names = {};
      document.querySelectorAll("button,a[href]").forEach((b) => {
        const n = (b.getAttribute("aria-label") || b.innerText).trim();
        names[n] = (names[n] || 0) + 1;
      });
      const dupButtons = Object.entries(names).filter(([, c]) => c > 1);
      const skipLink = !!document.querySelector('a[href^="#main"]');
      const required = [...document.querySelectorAll("[required]")].map((i) => {
        const l = document.querySelector(`label[for="${i.id}"]`) || i.closest("label");
        return { id: i.id, labelMarksRequired: !!l && /\*|обов/i.test(l.innerText) };
      });
      return { headings, dupButtons, skipLink, required };
    });
    await page.close();
  }

  // --- Темна тема AutoShop (axe після перемикання)
  if (name === "autoshop-index") {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.click("#theme-toggle");
    await new Promise((s) => setTimeout(s, 400));
    await page.evaluate(axeSource);
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }));
    r.darkTheme = res.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0].any[0]?.message.slice(0, 140) }));
    await page.screenshot({ path: path.join(dir, "screens", `${name}_dark.png`) });
    await page.close();
  }
  // повний скриншот desktop
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(dir, "screens", `${name}_1280.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(dir, "manual-checks.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
