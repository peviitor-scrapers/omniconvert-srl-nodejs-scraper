# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.2] - 2026-08-05

### Changed
- Aligned repository with the [EPAM nodejs template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper): full `scraper/` + `ai/` + `tests/` restructure, 5 GitHub Actions workflows (scrape, testing, disaster recovery, deep validation, template sync), docs under `docs/`.
- Scraper rewritten from the legacy solr/root layout to `scraper/index.js` (cheerio-based, parses `https://www.omniconvert.com/about/`). Extracts job links, JSON-LD structured data, locations, work types and post dates; maps to the Peviitor job model and transforms for the SOLR API.
- Company identity now lives in a single file: `scraper/config/company.json` (id `31411197`, legal `OMNICONVERT SRL`, brand `Omniconvert`, career URL `https://www.omniconvert.com/about/`).
- ANAF validation caches to committed `tests/company.json` with 7-day refresh and graceful fallback to stale cache when ANAF/demoANAF is unavailable.
- Tests ported to the template layout: `tests/unit`, `tests/integration`, `tests/e2e`, `tests/consistency`; `tests/validate-omniconvert-jobs.js` CLI for SOLR job validation.

## [1.0.0] - 2026-04-16

### Added
- Initial release
- Job scraping from the Omniconvert website
- Company validation via ANAF
- Solr integration for job storage
- GitHub Actions workflows for daily scraping and testing
- Comprehensive test suite (unit, integration, E2E)
- ANAF API fallback with cached data support
- Node 24 compatibility

### Features
- Automated daily job scraping
- Company core validation and management
- Job URL validation
- Data integrity checks
- Romanian location filtering
- Work mode normalization

## License

Copyright (c) 2024-2026 BOGA SEBASTIAN-NICOLAE
Licensed under MIT License
