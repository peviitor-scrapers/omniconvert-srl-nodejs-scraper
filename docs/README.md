# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile OMNICONVERT SRL din România.

Extrage anunțurile de pe [site-ul Omniconvert](https://www.omniconvert.com/about/) (parsează HTML cu cheerio) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul Peviitor.

> **🌱 Derived scraper.** Acest repo este derivat din [EPAM nodejs template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper). Alte scraper-e Node.js din ecosistemul peviitor.ro urmează același pattern.

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul OMNICONVERT (31411197) și verifică:
   - Denumirea oficială: OMNICONVERT SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — parsează pagina `/about/` cu cheerio (link-uri `/jobs/*` + date structurate JSON-LD)
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în Peviitor** — upsert prin API-ul Peviitor (job-uri și date companie)
6. **Generează jobs.md** — fișier markdown cu informații companie + toate job-urile curente

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| Omniconvert (HTML) | `https://www.omniconvert.com/about/` | Public |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |

## Robots.txt

Scraper-ul folosește un singur User-Agent identificabil și respectă robots.txt al site-ului. Pentru analiza completă, vezi [ai/ROBOTS.md](../ai/ROBOTS.md).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, Peviitor API conditional)
npm run test:integration

# Doar E2E (API real Omniconvert + ANAF + Peviitor)
npm run test:e2e
```

Testele Peviitor API folosesc `itIfApi` — se auto-skip dacă API-ul Peviitor nu e disponibil.
