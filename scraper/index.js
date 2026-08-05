import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, upsertJobs, upsertCompany, deleteJobByUrl } from "./api.js";
import { generateJobsMarkdown } from "./markdown-generator.js";
import companyConfig from "./config/company.js";
import scraperConfig from "./config/scraper.js";

const COMPANY_CIF = companyConfig.id;
const ABOUT_URL = `${scraperConfig.apiBase}/about/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let COMPANY_NAME = null;

// ============================================================================
// HTML PARSING
// ============================================================================

export function parseAboutPageJobs(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('a[href^="/jobs/"]').each((i, el) => {
    const href = $(el).attr("href");
    const li = $(el).closest("li");
    const title =
      li.find("h4").first().text().trim() ||
      $(el).text().trim() ||
      $(el).attr("title") ||
      "";

    if (title && href && href.startsWith("/jobs/")) {
      const fullUrl = `${scraperConfig.apiBase}${href}`;
      if (!jobs.find((j) => j.url === fullUrl)) {
        jobs.push({
          title,
          url: fullUrl,
          location: "",
          workplaceType: "",
          postingDate: ""
        });
      }
    }
  });

  return jobs;
}

export function extractStructuredData(html) {
  const $ = cheerio.load(html);
  const data = { title: "", location: "", workplaceType: "", postingDate: "" };

  const ldJson = $('script[type="application/ld+json"]')
    .map((i, el) => {
      try { return JSON.parse($(el).text()); } catch { return null; }
    })
    .get()
    .find((item) => {
      const graph = item["@graph"] || [];
      return graph.some((g) => g["@type"] === "JobPosting");
    });

  if (ldJson) {
    const graph = ldJson["@graph"] || [];
    const posting = graph.find((g) => g["@type"] === "JobPosting") || {};
    data.title = posting.title || "";
    data.postingDate = posting.datePosted ? posting.datePosted.slice(0, 10) : "";

    const addr = posting.jobLocation?.address || {};
    const city = addr.addressLocality || "";
    data.location = city === "Bucharest" ? "București" : city;

    if (posting.employmentType) {
      const et = posting.employmentType.toUpperCase();
      if (et === "FULL_TIME") data.workplaceType = "hybrid";
      else if (et === "PART_TIME") data.workplaceType = "hybrid";
      else if (et === "REMOTE") data.workplaceType = "remote";
      else if (et === "ON_SITE") data.workplaceType = "on-site";
    }
  }

  return data;
}

const LOCATION_WORK_REGEX = /(Bucharest|București|Iași|Cluj|Timișoara|Brașov|Constanța|Sibiu|Oradea)\s*[·•]\s*(Full-time|Part-time|Hybrid|Remote|On-site)/i;
const LOCATION_REGEX = /(Bucharest|București|Iași|Cluj|Timișoara|Brașov|Constanța|Sibiu|Oradea)/i;
const WORK_REGEX = /(Remote|On-Site|Onsite|Hybrid|Full-time|Part-time)/i;

function normalizeWorkType(w) {
  const lower = String(w).toLowerCase();
  if (lower === "on-site" || lower === "onsite") return "on-site";
  if (lower === "remote") return "remote";
  return "hybrid";
}

export function extractLocationFromText(text) {
  const data = { location: "", workplaceType: "" };

  const combined = text.match(LOCATION_WORK_REGEX);
  if (combined) {
    data.location = combined[1] === "Bucharest" ? "București" : combined[1];
    data.workplaceType = normalizeWorkType(combined[2]);
    return data;
  }

  const locMatch = text.match(LOCATION_REGEX);
  if (locMatch) {
    data.location = locMatch[1] === "Bucharest" ? "București" : locMatch[1];
  }

  const workMatch = text.match(WORK_REGEX);
  if (workMatch) {
    data.workplaceType = normalizeWorkType(workMatch[1]);
  }

  return data;
}

// ============================================================================
// SCRAPING
// ============================================================================

async function scrapeJobDetails(job) {
  try {
    const res = await fetch(job.url, {
      headers: { "User-Agent": "job_seeker_ro_spider" }
    });
    if (!res.ok) return job;
    const html = await res.text();
    const structured = extractStructuredData(html);

    if (structured.title) job.title = structured.title;
    if (structured.location) job.location = structured.location;
    if (structured.workplaceType) job.workplaceType = structured.workplaceType;
    if (structured.postingDate) job.postingDate = structured.postingDate;

    if (!job.location || !job.workplaceType) {
      const $ = cheerio.load(html);
      const visibleText = $("h1").first().parent().text() || $("body").text();
      const fallback = extractLocationFromText(visibleText);
      if (!job.location && fallback.location) job.location = fallback.location;
      if (!job.workplaceType && fallback.workplaceType) job.workplaceType = fallback.workplaceType;
    }
  } catch {
  }
  return job;
}

export async function scrapeJobs() {
  console.log(`Fetching ${ABOUT_URL}...`);
  const res = await fetch(ABOUT_URL, {
    headers: { "User-Agent": "job_seeker_ro_spider" }
  });
  const html = await res.text();

  let jobs = parseAboutPageJobs(html);
  console.log(`Found ${jobs.length} job links`);

  for (let i = 0; i < jobs.length; i++) {
    console.log(`Fetching details for: ${jobs[i].title}`);
    jobs[i] = await scrapeJobDetails(jobs[i]);
  }

  return jobs;
}

// ============================================================================
// JOB MODEL
// ============================================================================

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location ? [rawJob.location] : undefined,
    workmode: rawJob.workplaceType || undefined,
    date: now,
    status: "scraped"
  };

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

function transformJobsForSOLR(payload) {
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni'
  ];

  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    fs.mkdirSync("scraper", { recursive: true });

    console.log("=== Step 1: Get existing jobs from SOLR ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    const existingUrls = new Set(existingResult.docs.map(doc => doc.url).filter(Boolean));
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address, status } = await validateAndGetCompany();
    COMPANY_NAME = company;
    if (status === 'inactive') {
      console.log("⚠️ Company is INACTIVE — jobs deleted, skipping scrape.");
      return;
    }

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: companyConfig.brand || undefined,
        status: status === 'active' ? 'activ' : (status || "activ"),
        location: address ? [address] : companyConfig.location,
        website: companyConfig.website,
        career: companyConfig.career,
        lastScraped: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      console.log(`Note: Could not upsert company: ${err.message}`);
    }

    const rawJobs = await scrapeJobs();
    const scrapedCount = rawJobs.length;
    console.log(`Jobs scraped from Omniconvert website: ${scrapedCount}`);

    const jobs = rawJobs.map(job => mapToJobModel(job, cif));

    const payload = {
      source: scraperConfig.apiBase.replace("https://", ""),
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: cif,
      jobs
    };

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("scraper/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved scraper/jobs.json");

    const companyData = {
      id: cif,
      company: transformedPayload.company,
      brand: companyConfig.brand || undefined,
      status: status === 'active' ? 'activ' : (status || "activ"),
      location: address ? [address] : companyConfig.location,
      website: companyConfig.website,
      career: companyConfig.career,
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    fs.copyFileSync("scraper/config/company.json", "docs/company.json");
    console.log("Copied scraper/config/company.json → docs/company.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const scrapedUrls = new Set(transformedPayload.jobs.map(job => job.url));
    const staleUrls = [...existingUrls].filter(url => !scrapedUrls.has(url));

    if (staleUrls.length > 0) {
      console.log(`\n=== Step 4.5: Delete ${staleUrls.length} stale job(s) ===`);
      let deletedCount = 0;
      for (const url of staleUrls) {
        try {
          console.log(`  Deleting: ${url}`);
          await deleteJobByUrl(url);
          deletedCount++;
        } catch (delErr) {
          console.warn(`  ⚠️ Failed to delete: ${url} — ${delErr.message}`);
        }
      }
      console.log(`✅ Deleted ${deletedCount}/${staleUrls.length} stale job(s)`);
    } else {
      console.log("\n✅ No stale jobs to delete");
    }

    console.log("\n=== Step 5: Summary ===");

    await new Promise(r => setTimeout(r, 2000));
    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`Jobs scraped from Omniconvert website: ${scrapedCount}`);
    console.log(`Stale jobs attempted: ${staleUrls.length}`);
    console.log(`Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { mapToJobModel, transformJobsForSOLR };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
