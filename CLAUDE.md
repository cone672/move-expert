# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MoveExpert (`moveexpertselidbe.com`) — a static marketing site for a Belgrade moving company, built with **Eleventy (11ty) v3** using ESM config. All user-facing content is in **Serbian**; keep new copy in Serbian to match.

## Commands

```bash
npm run dev            # Eleventy --serve with live reload (loads .env if present)
npm run build          # Build to _site/ (root path prefix — used by the dev/FTP deploy)
npm run build-ghpages  # Build with --pathprefix=move-expert (only for *.github.io/move-expert/)
```

There is no test suite (`npm test` is a stub) and no linter configured.

Local builds read `GOOGLE_API_KEY` and `GOOGLE_PLACE_ID` from `.env` (see `.env.example`). Without them the Google reviews fetch is skipped gracefully and the site still builds.

## Architecture

**Page model.** Each top-level `*.html` is one page with YAML front matter (`title`, `description`, `heroSubtitle`, optional `ogImage`) and `layout: base.njk`. The page body is injected into `_includes/base.njk` at `{{ content | safe }}`. `base.njk` owns everything shared: `<head>` meta/OG/Twitter tags, GA tag, JSON-LD `MovingCompany` structured data, the floating call/WhatsApp/Viber bar, the slide-out nav drawer, the hero header, the bottom CTA, and the footer. **To add a page**, create a new `*.html` with the standard front matter; to change anything site-wide, edit `base.njk`.

**Asset pipeline (the non-obvious part).** CSS and JS are *not* passthrough-copied — they are bundled by **esbuild from inside `eleventy.config.js`** via an `eleventy.before` hook. `js/src/main.js` and `css/style.css` are the entry points; esbuild emits content-hashed files (`bundle-[hash].js`, `style-[hash].css`) into `_site/`. The hashed URLs are stored in a live `assets` global and referenced in templates as `{{ assets.js }}` / `{{ assets.css }}`. Edit sources under `js/src/` and `css/style.css`; never hand-edit anything in `_site/`.

**Browser JS.** `js/src/main.js` is the single bundle entry; it imports the feature modules (`menu`, `calculator`, `faq`, `scroll-animations`, `reviews-carousel`, `back-to-top`) and exposes `window.switchCalc` / `window.toggleFaq` for inline `onclick=` handlers in the HTML. The price calculator (`calculator.js`) is the largest module and powers `cenovnik.html#kalkulator`.

**Data.** Global data lives in `_data/`: `site.js` (canonical `url` + `name`, used throughout `base.njk`) and `googleReviews.js` (fetches Google Places reviews via `@11ty/eleventy-fetch`, cached 1 day in `.cache/`). `googleReviews` feeds both the reviews carousel (`_includes/google-reviews.njk`) and the `aggregateRating` in the JSON-LD.

**Generated SEO files.** `sitemap.njk`, `robots.njk`, and `llms.njk` use `permalink:` to emit `/sitemap.xml`, `/robots.txt`, and `/llms.txt`. `static/` is passthrough-copied to the site root (favicons, OG image, web manifest).

## Deployment

- **`deploy-dev.yml`** — runs on push to `main`/`master`; builds with `npm run build` and deploys `_site/` to the dev host over FTPS.
- **`deploy-gh-pages.yml`** — manual (`workflow_dispatch`) only; builds with `npm run build-ghpages`.

Both inject `GOOGLE_API_KEY` / `GOOGLE_PLACE_ID` from repo secrets and cache `.cache/` (the Eleventy fetch cache) across runs. Pushing to `main` publishes to dev automatically.
