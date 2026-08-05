# Robots.txt Analysis — www.omniconvert.com

Sursa: https://www.omniconvert.com/robots.txt

## Reguli

```
User-agent: *
Disallow: /*?
Disallow: /wp-admin/
Disallow: /blog/wp-admin/
Disallow: /blog/*.json
Disallow: /_astro/
Disallow: /preview-*
Disallow: /*.php$
Disallow: /*.js$
Allow: /_astro/*.css$
Allow: /_astro/*.webp$
Allow: /_astro/*.avif$
Allow: /_astro/*.svg$
```

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/about/` | ✅ Allowed | Pagina de cariere de la care scraper-ul extrage job-urile |
| `/jobs/*` | ✅ Allowed | Paginile individuale de job (doar verificate, nu parse-uite) |
| `/_astro/` | ❌ Disallowed | Static assets (JS/CSS bundle) — nu ne interesează |
| `/blog/*.json`, `/*.js$`, `/*?` | ❌ Disallowed | Endpoint-uri dinamice — nu le folosim |

## Recomandare

robots.txt NU este legal binding, dar reprezintă intenția proprietarului site-ului.

- Pagina `/about/` și paginile `/jobs/*` sunt **allow-ed** — scraperul respectă robots.txt integral.
- Scraperul face o singură cerere per execuție către `/about/` (fără paginare) cu delay politicos între cereri — comportament rezonabil, nu agresiv.
- Paginile individuale de job sunt doar verificate (HEAD/content) în validator, nu scraper-uite.

**Concluzie**: Risc minim. Părțile site-ului folosite sunt allow-ed de robots.txt, iar scraperul e politicos (User-Agent standard `job_seeker_ro_spider`, o singură cerere simultană).
