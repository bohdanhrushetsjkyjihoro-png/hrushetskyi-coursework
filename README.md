# Аудит доступності веб-сайту за стандартом WCAG 2.2 та впровадження виправлень

Курсова робота з дисципліни «WEB-технології та WEB-дизайн» (дослідницька, тема № 20).
Автор: Грушецький Богдан, група 31-КН. Керівник: Кулик Р. М.
ВСП «Івано-Франківський фаховий коледж ЛНУП», 2026.

Демонстраційний сайт: **https://hrushetskyi-coursework.vercel.app**

## Що зроблено

Проведено аудит трьох сторінок навчального сайту [OnlineShop](https://github.com/bohdanhrushetsjkyjihoro-png/OnlineShop) на відповідність WCAG 2.2 (рівні A і AA), усунено знайдені порушення і повторено вимірювання.

| Показник | До | Після |
|----------|----|-------|
| Порушень WCAG 2.2 A/AA (усі способи перевірки) | 8 | 0 |
| Порушень axe-core, головна сторінка (вузлів) | 3 | 0 |
| Lighthouse Accessibility, головна сторінка | 95 | 100 |
| Порушень, які знайшли автоматичні інструменти | 2 з 8 (25 %) | — |

Детально: [docs/audit-before.md](docs/audit-before.md) і [docs/audit-after.md](docs/audit-after.md).

## Структура

```
site/              демонстраційний сайт (OnlineShop, AutoShop, Express API)
audit/             скрипти аудиту: audit.mjs (axe-core + Lighthouse), manual.mjs (WCAG 2.2 перевірки)
results/before/    сирі звіти до виправлень (JSON axe, Lighthouse, manual-checks, скриншоти)
results/after/     сирі звіти після виправлень
docs/              реєстр порушень, результати, рисунки, пояснювальна записка
```

## Як повторити вимірювання

1. Запустити API і сторінки сайту:

   ```sh
   cd site/server && npm install && npm start
   # в іншому терміналі
   python -m http.server 8081 --directory site/OnlineShop
   python -m http.server 8082 --directory site/AutoShop
   ```

2. Запустити аудит (потрібен Google Chrome):

   ```sh
   cd audit
   npm install
   # Windows (PowerShell):
   $env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
   node audit.mjs before ../results-my
   node manual.mjs before ../results-my
   ```

Результати з'являться в папці `results-my/before`: `summary.json` (підсумок), окремі JSON-звіти axe і Lighthouse.

## Інструменти

axe-core 4.14, Lighthouse 13.6, Puppeteer 25, Node.js 22, Tailwind CSS 3.4, Visual Studio Code, Git, GitHub.

## Публікація

Демонстраційний сайт: https://hrushetskyi-coursework.vercel.app (Vercel, папка `site/OnlineShop`).
