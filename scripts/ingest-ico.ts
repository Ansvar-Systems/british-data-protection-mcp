/**
 * ICO (Information Commissioner's Office) ingestion crawler.
 *
 * Scrapes enforcement actions and guidance from ico.org.uk and populates
 * the SQLite database used by the British Data Protection MCP server.
 *
 * Data sources:
 *   - Enforcement actions: ico.org.uk/action-weve-taken/enforcement/
 *     (monetary penalties, enforcement notices, reprimands, prosecutions)
 *   - Guidance: ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/
 *     (guides, codes of practice, detailed topic guidance)
 *
 * Usage:
 *   npx tsx scripts/ingest-ico.ts                # full crawl
 *   npx tsx scripts/ingest-ico.ts --resume       # skip already-ingested URLs
 *   npx tsx scripts/ingest-ico.ts --dry-run      # scrape but don't write to DB
 *   npx tsx scripts/ingest-ico.ts --force        # drop DB and rebuild from scratch
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cheerio from "cheerio";
import { SCHEMA_SQL } from "../src/db.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env["ICO_DB_PATH"] ?? "data/ico.db";
const STATE_PATH = process.env["ICO_STATE_PATH"] ?? "data/.ingest-state.json";

const BASE_URL = "https://ico.org.uk";

/** Minimum delay between HTTP requests (ms). */
const RATE_LIMIT_MS = 1_500;

/** Maximum retry attempts per request. */
const MAX_RETRIES = 3;

/** Base backoff delay between retries (ms). Doubles each attempt. */
const RETRY_BACKOFF_MS = 3_000;

/** HTTP request timeout (ms). */
const REQUEST_TIMEOUT_MS = 30_000;

const USER_AGENT =
  "AnsvarICOCrawler/1.0 (+https://ansvar.eu; compliance research)";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const FLAG_RESUME = args.includes("--resume");
const FLAG_DRY_RUN = args.includes("--dry-run");
const FLAG_FORCE = args.includes("--force");

// ---------------------------------------------------------------------------
// State management (for --resume)
// ---------------------------------------------------------------------------

interface IngestState {
  /** URLs already successfully ingested. */
  completed: string[];
  /** ISO timestamp of last run. */
  lastRun: string | null;
}

function loadState(): IngestState {
  if (existsSync(STATE_PATH)) {
    try {
      return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as IngestState;
    } catch {
      // Corrupt state file — start fresh.
    }
  }
  return { completed: [], lastRun: null };
}

function saveState(state: IngestState): void {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "follow",
  });
  return response;
}

async function fetchWithRetry(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await rateLimitedFetch(url);
      if (res.status === 404) {
        log(`  404 Not Found: ${url}`);
        return null;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
        log(`  Retry ${attempt}/${MAX_RETRIES} for ${url} (${message}), waiting ${backoff}ms`);
        await sleep(backoff);
      } else {
        log(`  FAILED after ${MAX_RETRIES} attempts: ${url} — ${message}`);
        return null;
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Enforcement action types recognised by ICO
// ---------------------------------------------------------------------------

const ENFORCEMENT_TYPES: Record<string, string> = {
  "monetary-penalties": "monetary_penalty",
  "enforcement-notices": "enforcement_notice",
  "reprimands": "reprimand",
  "information-notices": "information_notice",
  "prosecutions": "prosecution",
  "undertakings": "undertaking",
};

// ---------------------------------------------------------------------------
// Topic detection — maps keywords in text to topic IDs
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS: [string, string[]][] = [
  ["consent", ["consent", "lawful basis", "article 6", "article 7"]],
  ["children", ["children", "child", "age appropriate", "children's code", "article 8"]],
  ["direct_marketing", ["direct marketing", "marketing call", "unsolicited", "PECR", "nuisance call", "TPS"]],
  ["data_sharing", ["data sharing", "disclosure", "sharing agreement"]],
  ["international_transfers", ["international transfer", "adequacy", "transfer of data", "third country"]],
  ["subject_access", ["subject access", "SAR", "right of access", "article 15"]],
  ["cookies", ["cookie", "tracker", "PECR regulation 6"]],
  ["breach_notification", ["data breach", "breach notification", "article 33", "article 34", "personal data breach"]],
  ["legitimate_interest", ["legitimate interest", "article 6(1)(f)", "LIA", "balancing test"]],
  ["data_security", ["security", "encryption", "phishing", "malware", "cyber", "vulnerability", "article 32"]],
  ["accuracy", ["accuracy", "inaccurate", "article 5(1)(d)"]],
  ["transparency", ["transparency", "privacy notice", "privacy policy", "fair processing"]],
  ["automated_decision", ["automated decision", "profiling", "article 22"]],
  ["dpia", ["DPIA", "impact assessment", "article 35"]],
  ["accountability", ["accountability", "record of processing", "article 30"]],
];

function detectTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [topicId, keywords] of TOPIC_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      matched.push(topicId);
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// GDPR article detection
// ---------------------------------------------------------------------------

function detectGdprArticles(text: string): string[] {
  const articles = new Set<string>();
  // Match patterns like "Article 5", "article 32", "Article 5(1)(f)"
  const pattern = /\barticle\s+(\d+)(?:\s*\([^)]*\))*\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const num = match[1];
    if (num !== undefined) {
      articles.add(num);
    }
  }
  // Also match "regulation 19 of PECR" etc. — store as "PECR-19"
  const pecrPattern = /\bregulation\s+(\d+)\s+of\s+PECR\b/gi;
  while ((match = pecrPattern.exec(text)) !== null) {
    const num = match[1];
    if (num !== undefined) {
      articles.add(`PECR-${num}`);
    }
  }
  return Array.from(articles).sort();
}

// ---------------------------------------------------------------------------
// Fine amount extraction
// ---------------------------------------------------------------------------

function extractFineAmount(text: string): number | null {
  // Match patterns like "£20,000,000", "£7,552,800", "GBP 20 million", "£4.4 million"
  const patterns = [
    /£([\d,]+(?:\.\d+)?)\s*million/i,
    /GBP\s*([\d,]+(?:\.\d+)?)\s*million/i,
    /£([\d,]+(?:\.\d+)?)/,
    /GBP\s*([\d,]+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const raw = match[1].replace(/,/g, "");
      const value = parseFloat(raw);
      if (isNaN(value)) continue;
      // Check if "million" variant
      if (pattern.source.includes("million")) {
        return value * 1_000_000;
      }
      return value;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enforcement action scraping
// ---------------------------------------------------------------------------

interface EnforcementLink {
  url: string;
  title: string;
  date: string | null;
  type: string | null;
}

/**
 * Scrape the enforcement listing page. ICO renders results via JavaScript,
 * but the listing page also contains static anchor links to individual
 * enforcement pages. We crawl the static site map approach: scrape the
 * enforcement section's known URL patterns by type.
 *
 * Since the main listing is JS-rendered, we instead crawl the sitemap
 * and known URL patterns.
 */
async function discoverEnforcementLinks(): Promise<EnforcementLink[]> {
  const links: EnforcementLink[] = [];

  // Strategy 1: Try the XML sitemap for comprehensive URL discovery.
  const sitemapUrls = [
    `${BASE_URL}/sitemap.xml`,
    `${BASE_URL}/sitemapindex.xml`,
  ];

  let sitemapLinks = 0;
  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchWithRetry(sitemapUrl);
    if (!xml) continue;

    const $ = cheerio.load(xml, { xmlMode: true });

    // Handle sitemap index (links to child sitemaps)
    const childSitemaps: string[] = [];
    $("sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.includes("action-weve-taken") || loc.includes("enforcement")) {
        childSitemaps.push(loc);
      }
    });

    // If it's a sitemap index, fetch relevant child sitemaps
    for (const childUrl of childSitemaps) {
      const childXml = await fetchWithRetry(childUrl);
      if (!childXml) continue;
      const child$ = cheerio.load(childXml, { xmlMode: true });
      child$("url > loc").each((_, el) => {
        const loc = child$(el).text().trim();
        if (loc.includes("/action-weve-taken/enforcement/") && !loc.endsWith("/enforcement/")) {
          links.push({ url: loc, title: "", date: null, type: null });
          sitemapLinks++;
        }
      });
    }

    // Direct sitemap entries
    $("url > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.includes("/action-weve-taken/enforcement/") && !loc.endsWith("/enforcement/")) {
        links.push({ url: loc, title: "", date: null, type: null });
        sitemapLinks++;
      }
    });
  }
  log(`Sitemap discovery found ${sitemapLinks} enforcement URLs`);

  // Strategy 2: Scrape HTML listing pages (multiple pages) as fallback/supplement.
  // ICO uses query params for filtering. Try each enforcement type.
  for (const [typeSlug] of Object.entries(ENFORCEMENT_TYPES)) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const listUrl =
        `${BASE_URL}/action-weve-taken/enforcement/` +
        `?facet_type=${encodeURIComponent(typeSlug)}&page=${page}&sort_by=date_desc`;

      log(`Fetching enforcement listing: type=${typeSlug} page=${page}`);
      const html = await fetchWithRetry(listUrl);
      if (!html) {
        hasMore = false;
        break;
      }

      const $ = cheerio.load(html);
      let foundOnPage = 0;

      // Look for links in the results area. ICO pages use various patterns:
      // - <a> tags within result list items
      // - Links containing /action-weve-taken/enforcement/ in href
      $('a[href*="/action-weve-taken/enforcement/"]').each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        // Skip the listing page itself, pagination, and filter links
        if (href.endsWith("/enforcement/") || href.includes("facet_") || href.includes("page=")) return;
        // Skip breadcrumb/nav links
        const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        if (!fullUrl.includes("/action-weve-taken/enforcement/")) return;

        const title = $(el).text().trim();

        // Check for duplicates
        if (!links.some((l) => l.url === fullUrl)) {
          links.push({
            url: fullUrl,
            title,
            date: null,
            type: typeSlug,
          });
          foundOnPage++;
        }
      });

      log(`  Found ${foundOnPage} links on page ${page}`);

      // Check for next page
      const hasNext =
        $('a[href*="page="]').filter((_, el) => {
          const text = $(el).text().trim().toLowerCase();
          return text === "next" || text.includes("next");
        }).length > 0;

      if (!hasNext || foundOnPage === 0) {
        hasMore = false;
      } else {
        page++;
        // Safety limit
        if (page > 50) {
          log(`  Reached page limit (50) for type=${typeSlug}`);
          hasMore = false;
        }
      }
    }
  }

  // Strategy 3: Also try the "all types" listing without a type filter.
  for (let page = 1; page <= 50; page++) {
    const listUrl =
      `${BASE_URL}/action-weve-taken/enforcement/?page=${page}&sort_by=date_desc`;

    log(`Fetching enforcement listing: all types page=${page}`);
    const html = await fetchWithRetry(listUrl);
    if (!html) break;

    const $ = cheerio.load(html);
    let foundOnPage = 0;

    $('a[href*="/action-weve-taken/enforcement/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (href.endsWith("/enforcement/") || href.includes("facet_") || href.includes("page=")) return;

      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (!fullUrl.includes("/action-weve-taken/enforcement/")) return;

      const title = $(el).text().trim();
      if (!links.some((l) => l.url === fullUrl)) {
        links.push({ url: fullUrl, title, date: null, type: null });
        foundOnPage++;
      }
    });

    if (foundOnPage === 0) break;
  }

  // Deduplicate by URL (normalise trailing slashes)
  const seen = new Set<string>();
  const deduped: EnforcementLink[] = [];
  for (const link of links) {
    const normalised = link.url.replace(/\/+$/, "");
    if (!seen.has(normalised)) {
      seen.add(normalised);
      deduped.push({ ...link, url: normalised });
    }
  }

  log(`Total unique enforcement URLs discovered: ${deduped.length}`);
  return deduped;
}

interface ParsedDecision {
  reference: string;
  title: string;
  date: string | null;
  type: string | null;
  entity_name: string | null;
  fine_amount: number | null;
  summary: string | null;
  full_text: string;
  topics: string;
  gdpr_articles: string;
  status: string;
}

function parseEnforcementPage(html: string, url: string, hintType: string | null): ParsedDecision | null {
  const $ = cheerio.load(html);

  // --- Title / entity name ---
  // The <h1> typically contains the entity name.
  const h1 = $("h1").first().text().trim();
  if (!h1) {
    log(`  No <h1> found on ${url}, skipping`);
    return null;
  }

  // Use h1 as entity name. For monetary penalties the title often includes
  // the entity name directly.
  const entityName = h1;

  // --- Metadata extraction ---
  // ICO enforcement pages display metadata as a list: Date, Type, Sector.
  // The structure varies but commonly uses <li>, <dl>, or plain text blocks
  // near the top with bold labels.

  let dateStr: string | null = null;
  let enforcementType: string | null = hintType ? (ENFORCEMENT_TYPES[hintType] ?? hintType) : null;
  let sector: string | null = null;

  // Try definition list pattern (<dl><dt>Date</dt><dd>1 March 2024</dd>)
  $("dt, strong, b").each((_, el) => {
    const label = $(el).text().trim().toLowerCase().replace(/:$/, "");
    // Get the sibling/next text content
    const valueEl = $(el).next("dd").length > 0
      ? $(el).next("dd")
      : $(el).parent();
    const valueText = valueEl.text().trim();
    // Remove the label from the value
    const value = valueText.replace(new RegExp(`^${escapeRegex($(el).text().trim())}\\s*:?\\s*`, "i"), "").trim();

    if (label === "date" && value) {
      dateStr = parseDate(value);
    } else if (label === "type" && value) {
      enforcementType = normaliseEnforcementType(value);
    } else if (label === "sector" && value) {
      sector = value;
    }
  });

  // Fallback: look for date in list items
  if (!dateStr) {
    $("li, p").each((_, el) => {
      const text = $(el).text().trim();
      const dateMatch = /^Date\s*:?\s*(.+)/i.exec(text);
      if (dateMatch?.[1]) {
        dateStr = parseDate(dateMatch[1].trim());
      }
      const typeMatch = /^Type\s*:?\s*(.+)/i.exec(text);
      if (typeMatch?.[1] && !enforcementType) {
        enforcementType = normaliseEnforcementType(typeMatch[1].trim());
      }
    });
  }

  // --- Extract main content text ---
  // Remove nav, header, footer, sidebar, breadcrumbs, scripts, styles
  $(
    "nav, header, footer, script, style, noscript, .breadcrumb, " +
    ".site-header, .site-footer, .cookie-banner, .skip-link, " +
    '[role="navigation"], [role="banner"], [role="contentinfo"]'
  ).remove();

  // Get the main content — look for <main>, <article>, or .content-body
  let contentEl = $("main").first();
  if (!contentEl.length) contentEl = $("article").first();
  if (!contentEl.length) contentEl = $(".content-body, .page-content, .article-content").first();
  if (!contentEl.length) contentEl = $("body");

  const fullText = contentEl
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (fullText.length < 50) {
    log(`  Content too short (${fullText.length} chars) on ${url}, skipping`);
    return null;
  }

  // --- Extract summary ---
  // Use the first substantial paragraph as summary.
  let summary: string | null = null;
  contentEl.find("p").each((_, el) => {
    if (summary) return;
    const pText = $(el).text().trim();
    if (pText.length > 80 && !pText.toLowerCase().startsWith("date") && !pText.toLowerCase().startsWith("type")) {
      summary = pText.slice(0, 1000);
    }
  });

  // --- Fine amount ---
  const fineAmount = extractFineAmount(fullText);

  // --- Generate reference ---
  // Build a stable reference from the URL path.
  const urlPath = new URL(url).pathname
    .replace(/^\/action-weve-taken\/enforcement\//, "")
    .replace(/\/+$/, "");
  const reference = `ICO-ENF-${urlPath.replace(/\//g, "-").toUpperCase()}`;

  // --- Build title ---
  const typeLabel = enforcementType
    ? enforcementType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Enforcement Action";
  const title = `${typeLabel} — ${entityName}`;

  // --- Topics and articles ---
  const topics = detectTopics(fullText);
  const gdprArticles = detectGdprArticles(fullText);

  return {
    reference,
    title,
    date: dateStr,
    type: enforcementType,
    entity_name: entityName,
    fine_amount: fineAmount,
    summary,
    full_text: fullText,
    topics: JSON.stringify(topics),
    gdpr_articles: JSON.stringify(gdprArticles),
    status: "final",
  };
}

// ---------------------------------------------------------------------------
// Guidance scraping
// ---------------------------------------------------------------------------

/** Top-level guidance hub pages to crawl for sub-page links. */
const GUIDANCE_HUBS = [
  "/for-organisations/uk-gdpr-guidance-and-resources/",
  "/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/",
  "/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/",
  "/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/",
  "/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/",
  "/for-organisations/uk-gdpr-guidance-and-resources/security/",
  "/for-organisations/uk-gdpr-guidance-and-resources/data-breaches/",
  "/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/",
  "/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/",
  "/for-organisations/uk-gdpr-guidance-and-resources/data-protection-impact-assessments-dpias/",
  "/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/",
  "/for-organisations/uk-gdpr-guidance-and-resources/exemptions/",
  "/for-organisations/direct-marketing-and-privacy-and-electronic-communications/",
  "/for-organisations/uk-gdpr-guidance-and-resources/controllers-and-processors/",
  "/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/",
  "/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/",
  "/for-organisations/uk-gdpr-guidance-and-resources/designing-products-that-protect-privacy/",
];

interface GuidanceLink {
  url: string;
  title: string;
  section: string;
}

async function discoverGuidanceLinks(): Promise<GuidanceLink[]> {
  const links: GuidanceLink[] = [];
  const seen = new Set<string>();

  // First try sitemap for guidance URLs
  const sitemapUrls = [
    `${BASE_URL}/sitemap.xml`,
    `${BASE_URL}/sitemapindex.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchWithRetry(sitemapUrl);
    if (!xml) continue;

    const $ = cheerio.load(xml, { xmlMode: true });

    // Handle sitemap index
    const childSitemaps: string[] = [];
    $("sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.includes("for-organisations") || loc.includes("guidance")) {
        childSitemaps.push(loc);
      }
    });

    for (const childUrl of childSitemaps) {
      const childXml = await fetchWithRetry(childUrl);
      if (!childXml) continue;
      const child$ = cheerio.load(childXml, { xmlMode: true });
      child$("url > loc").each((_, el) => {
        const loc = child$(el).text().trim();
        if (isGuidancePage(loc)) {
          const normalised = loc.replace(/\/+$/, "");
          if (!seen.has(normalised)) {
            seen.add(normalised);
            links.push({ url: normalised, title: "", section: extractSection(loc) });
          }
        }
      });
    }

    $("url > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (isGuidancePage(loc)) {
        const normalised = loc.replace(/\/+$/, "");
        if (!seen.has(normalised)) {
          seen.add(normalised);
          links.push({ url: normalised, title: "", section: extractSection(loc) });
        }
      }
    });
  }

  log(`Sitemap discovery found ${links.length} guidance URLs`);

  // Also crawl hub pages for links
  for (const hubPath of GUIDANCE_HUBS) {
    const hubUrl = `${BASE_URL}${hubPath}`;
    log(`Fetching guidance hub: ${hubPath}`);
    const html = await fetchWithRetry(hubUrl);
    if (!html) continue;

    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (!isGuidancePage(fullUrl)) return;

      const normalised = fullUrl.replace(/\/+$/, "");
      if (seen.has(normalised)) return;
      seen.add(normalised);

      const title = $(el).text().trim();
      links.push({
        url: normalised,
        title,
        section: extractSection(fullUrl),
      });
    });
  }

  log(`Total unique guidance URLs discovered: ${links.length}`);
  return links;
}

function isGuidancePage(url: string): boolean {
  // Must be an ICO guidance page, not a hub/index
  if (!url.includes("ico.org.uk/for-organisations/")) return false;
  // Skip external, PDF, media links
  if (url.includes("/media/") || url.endsWith(".pdf")) return false;
  // Skip very short paths that are just hubs
  const path = new URL(url).pathname;
  const segments = path.split("/").filter(Boolean);
  // Need at least 3 segments: for-organisations / topic / sub-page
  return segments.length >= 3;
}

function extractSection(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);
    // E.g. ["for-organisations", "uk-gdpr-guidance-and-resources", "lawful-basis", "consent"]
    if (segments.length >= 3) {
      return segments[2]!.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // Ignore
  }
  return "General";
}

interface ParsedGuideline {
  reference: string | null;
  title: string;
  date: string | null;
  type: string;
  summary: string | null;
  full_text: string;
  topics: string;
  language: string;
}

function parseGuidancePage(html: string, url: string): ParsedGuideline | null {
  const $ = cheerio.load(html);

  const h1 = $("h1").first().text().trim();
  if (!h1) {
    log(`  No <h1> found on ${url}, skipping`);
    return null;
  }

  // Remove nav, header, footer, etc.
  $(
    "nav, header, footer, script, style, noscript, .breadcrumb, " +
    ".site-header, .site-footer, .cookie-banner, .skip-link, " +
    '[role="navigation"], [role="banner"], [role="contentinfo"]'
  ).remove();

  let contentEl = $("main").first();
  if (!contentEl.length) contentEl = $("article").first();
  if (!contentEl.length) contentEl = $(".content-body, .page-content").first();
  if (!contentEl.length) contentEl = $("body");

  const fullText = contentEl
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (fullText.length < 100) {
    log(`  Content too short (${fullText.length} chars) on ${url}, skipping`);
    return null;
  }

  // Summary: first substantial paragraph
  let summary: string | null = null;
  contentEl.find("p").each((_, el) => {
    if (summary) return;
    const pText = $(el).text().trim();
    if (pText.length > 80) {
      summary = pText.slice(0, 1000);
    }
  });

  // Detect date from page content
  let date: string | null = null;
  $("time[datetime]").each((_, el) => {
    if (!date) {
      date = $(el).attr("datetime") ?? null;
    }
  });

  // Determine type based on URL path
  let guideType = "guide";
  const urlLower = url.toLowerCase();
  if (urlLower.includes("code-of-practice") || urlLower.includes("childrens-code")) {
    guideType = "code_of_practice";
  } else if (urlLower.includes("checklist")) {
    guideType = "checklist";
  } else if (urlLower.includes("tool") || urlLower.includes("interactive")) {
    guideType = "interactive_tool";
  }

  // Build a reference from the URL path
  const path = new URL(url).pathname.replace(/\/+$/, "").replace(/^\//, "");
  const refSlug = path
    .replace(/for-organisations\//i, "")
    .replace(/uk-gdpr-guidance-and-resources\//i, "")
    .replace(/\//g, "-")
    .toUpperCase()
    .slice(0, 80);
  const reference = `ICO-GUIDE-${refSlug}`;

  const topics = detectTopics(fullText);

  return {
    reference,
    title: h1,
    date,
    type: guideType,
    summary,
    full_text: fullText,
    topics: JSON.stringify(topics),
    language: "en",
  };
}

// ---------------------------------------------------------------------------
// Topic seeding
// ---------------------------------------------------------------------------

const TOPICS: Array<{ id: string; name_en: string; description: string }> = [
  { id: "consent", name_en: "Consent", description: "Lawfulness of processing based on consent and conditions for valid consent under UK GDPR Article 6 and 7." },
  { id: "children", name_en: "Children's data", description: "Protection of children's personal data, including the Age Appropriate Design Code (Children's Code)." },
  { id: "direct_marketing", name_en: "Direct marketing", description: "Privacy requirements for direct marketing including email, SMS, and phone marketing under PECR and UK GDPR." },
  { id: "data_sharing", name_en: "Data sharing", description: "Data sharing between organisations, data sharing agreements, and lawful bases for disclosure." },
  { id: "international_transfers", name_en: "International transfers", description: "Transfers of personal data to countries outside the UK, adequacy decisions, and appropriate safeguards." },
  { id: "subject_access", name_en: "Subject access", description: "Right of access by data subjects (Subject Access Requests / SARs) under UK GDPR Article 15." },
  { id: "cookies", name_en: "Cookies and trackers", description: "Use of cookies and similar tracking technologies under the Privacy and Electronic Communications Regulations (PECR)." },
  { id: "breach_notification", name_en: "Data breach notification", description: "Notification requirements for personal data breaches to the ICO (72 hours) and affected individuals." },
  { id: "legitimate_interest", name_en: "Legitimate interests", description: "Processing under the legitimate interests lawful basis (UK GDPR Article 6(1)(f)) and the three-part test." },
  { id: "data_security", name_en: "Data security", description: "Technical and organisational measures to ensure security of processing under UK GDPR Article 32." },
  { id: "accuracy", name_en: "Data accuracy", description: "Obligation to keep personal data accurate and up to date under UK GDPR Article 5(1)(d)." },
  { id: "transparency", name_en: "Transparency", description: "Fair processing notices, privacy policies, and the right to be informed under UK GDPR Articles 13 and 14." },
  { id: "automated_decision", name_en: "Automated decision-making", description: "Rights related to automated decision-making including profiling under UK GDPR Article 22." },
  { id: "dpia", name_en: "Data protection impact assessments", description: "When and how to carry out DPIAs under UK GDPR Article 35." },
  { id: "accountability", name_en: "Accountability", description: "Accountability obligations including records of processing, DPOs, and governance under UK GDPR." },
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(text: string): string | null {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // Try "1 March 2024", "28 August 2025", etc.
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };

  const match = /(\d{1,2})\s+(\w+)\s+(\d{4})/.exec(text);
  if (match) {
    const day = match[1]!.padStart(2, "0");
    const monthStr = match[2]!.toLowerCase();
    const year = match[3];
    const month = months[monthStr];
    if (month && year) return `${year}-${month}-${day}`;
  }

  // Try "March 2024" (no day)
  const monthYearMatch = /(\w+)\s+(\d{4})/.exec(text);
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1]!.toLowerCase();
    const year = monthYearMatch[2];
    const month = months[monthStr];
    if (month && year) return `${year}-${month}-01`;
  }

  return null;
}

function normaliseEnforcementType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("monetary") || lower.includes("penalty") || lower.includes("fine")) {
    return "monetary_penalty";
  }
  if (lower.includes("enforcement notice")) return "enforcement_notice";
  if (lower.includes("reprimand")) return "reprimand";
  if (lower.includes("information notice")) return "information_notice";
  if (lower.includes("prosecution")) return "prosecution";
  if (lower.includes("undertaking")) return "undertaking";
  if (lower.includes("warning")) return "warning";
  return lower.replace(/\s+/g, "_");
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

function initDb(): Database.Database {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (FLAG_FORCE && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    log(`Deleted existing database at ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function insertTopics(db: Database.Database): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO topics (id, name_en, description) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const t of TOPICS) {
      stmt.run(t.id, t.name_en, t.description);
    }
  });
  tx();
  log(`Inserted/verified ${TOPICS.length} topics`);
}

function upsertDecision(db: Database.Database, d: ParsedDecision): boolean {
  // Check if already exists
  const existing = db
    .prepare("SELECT id FROM decisions WHERE reference = ?")
    .get(d.reference) as { id: number } | undefined;

  if (existing) {
    // Update
    db.prepare(`
      UPDATE decisions SET
        title = ?, date = ?, type = ?, entity_name = ?, fine_amount = ?,
        summary = ?, full_text = ?, topics = ?, gdpr_articles = ?, status = ?
      WHERE reference = ?
    `).run(
      d.title, d.date, d.type, d.entity_name, d.fine_amount,
      d.summary, d.full_text, d.topics, d.gdpr_articles, d.status,
      d.reference,
    );
    return false; // Updated, not inserted
  }

  db.prepare(`
    INSERT INTO decisions
      (reference, title, date, type, entity_name, fine_amount, summary, full_text, topics, gdpr_articles, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.reference, d.title, d.date, d.type, d.entity_name, d.fine_amount,
    d.summary, d.full_text, d.topics, d.gdpr_articles, d.status,
  );
  return true; // Inserted
}

function upsertGuideline(db: Database.Database, g: ParsedGuideline): boolean {
  if (g.reference) {
    const existing = db
      .prepare("SELECT id FROM guidelines WHERE reference = ?")
      .get(g.reference) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE guidelines SET
          title = ?, date = ?, type = ?, summary = ?, full_text = ?,
          topics = ?, language = ?
        WHERE reference = ?
      `).run(
        g.title, g.date, g.type, g.summary, g.full_text,
        g.topics, g.language, g.reference,
      );
      return false;
    }
  }

  db.prepare(`
    INSERT INTO guidelines (reference, title, date, type, summary, full_text, topics, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    g.reference, g.title, g.date, g.type, g.summary, g.full_text,
    g.topics, g.language,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("ICO Ingestion Crawler starting");
  log(`  DB path:  ${resolve(DB_PATH)}`);
  log(`  Flags:    ${[FLAG_RESUME && "--resume", FLAG_DRY_RUN && "--dry-run", FLAG_FORCE && "--force"].filter(Boolean).join(" ") || "(none)"}`);

  const state = FLAG_RESUME ? loadState() : { completed: [], lastRun: null };
  const completedSet = new Set(state.completed);

  if (FLAG_RESUME && completedSet.size > 0) {
    log(`Resuming: ${completedSet.size} URLs already completed`);
  }

  // Initialise database
  let db: Database.Database | null = null;
  if (!FLAG_DRY_RUN) {
    db = initDb();
    insertTopics(db);
  } else {
    log("DRY RUN — no database writes");
  }

  // --- Phase 1: Enforcement actions ---
  log("\n=== Phase 1: Enforcement Actions ===");

  const enforcementLinks = await discoverEnforcementLinks();
  let decisionsInserted = 0;
  let decisionsUpdated = 0;
  let decisionsSkipped = 0;
  let decisionsFailed = 0;

  for (let i = 0; i < enforcementLinks.length; i++) {
    const link = enforcementLinks[i]!;

    if (FLAG_RESUME && completedSet.has(link.url)) {
      decisionsSkipped++;
      continue;
    }

    log(`[${i + 1}/${enforcementLinks.length}] Fetching: ${link.url}`);
    const html = await fetchWithRetry(link.url);
    if (!html) {
      decisionsFailed++;
      continue;
    }

    const decision = parseEnforcementPage(html, link.url, link.type);
    if (!decision) {
      decisionsFailed++;
      continue;
    }

    if (FLAG_DRY_RUN) {
      log(`  [DRY RUN] Would insert: ${decision.reference} — ${decision.entity_name} (${decision.type}, fine: ${decision.fine_amount ?? "N/A"})`);
      decisionsInserted++;
    } else {
      const isNew = upsertDecision(db!, decision);
      if (isNew) {
        decisionsInserted++;
        log(`  Inserted: ${decision.reference} — ${decision.entity_name}`);
      } else {
        decisionsUpdated++;
        log(`  Updated: ${decision.reference} — ${decision.entity_name}`);
      }
    }

    completedSet.add(link.url);

    // Periodic state save for resume support
    if (i > 0 && i % 20 === 0) {
      state.completed = Array.from(completedSet);
      saveState(state);
    }
  }

  log(`\nEnforcement results: ${decisionsInserted} inserted, ${decisionsUpdated} updated, ${decisionsSkipped} skipped (resume), ${decisionsFailed} failed`);

  // --- Phase 2: Guidance ---
  log("\n=== Phase 2: Guidance Documents ===");

  const guidanceLinks = await discoverGuidanceLinks();
  let guidelinesInserted = 0;
  let guidelinesUpdated = 0;
  let guidelinesSkipped = 0;
  let guidelinesFailed = 0;

  for (let i = 0; i < guidanceLinks.length; i++) {
    const link = guidanceLinks[i]!;

    if (FLAG_RESUME && completedSet.has(link.url)) {
      guidelinesSkipped++;
      continue;
    }

    log(`[${i + 1}/${guidanceLinks.length}] Fetching: ${link.url}`);
    const html = await fetchWithRetry(link.url);
    if (!html) {
      guidelinesFailed++;
      continue;
    }

    const guideline = parseGuidancePage(html, link.url);
    if (!guideline) {
      guidelinesFailed++;
      continue;
    }

    if (FLAG_DRY_RUN) {
      log(`  [DRY RUN] Would insert: ${guideline.reference} — ${guideline.title}`);
      guidelinesInserted++;
    } else {
      const isNew = upsertGuideline(db!, guideline);
      if (isNew) {
        guidelinesInserted++;
        log(`  Inserted: ${guideline.reference} — ${guideline.title}`);
      } else {
        guidelinesUpdated++;
        log(`  Updated: ${guideline.reference} — ${guideline.title}`);
      }
    }

    completedSet.add(link.url);

    if (i > 0 && i % 20 === 0) {
      state.completed = Array.from(completedSet);
      saveState(state);
    }
  }

  log(`\nGuidance results: ${guidelinesInserted} inserted, ${guidelinesUpdated} updated, ${guidelinesSkipped} skipped (resume), ${guidelinesFailed} failed`);

  // --- Final summary ---
  if (db) {
    const decisionCount = (db.prepare("SELECT count(*) as cnt FROM decisions").get() as { cnt: number }).cnt;
    const guidelineCount = (db.prepare("SELECT count(*) as cnt FROM guidelines").get() as { cnt: number }).cnt;
    const topicCount = (db.prepare("SELECT count(*) as cnt FROM topics").get() as { cnt: number }).cnt;
    const decisionFtsCount = (db.prepare("SELECT count(*) as cnt FROM decisions_fts").get() as { cnt: number }).cnt;
    const guidelineFtsCount = (db.prepare("SELECT count(*) as cnt FROM guidelines_fts").get() as { cnt: number }).cnt;

    log("\n=== Database Summary ===");
    log(`  Topics:      ${topicCount}`);
    log(`  Decisions:   ${decisionCount} (FTS: ${decisionFtsCount})`);
    log(`  Guidelines:  ${guidelineCount} (FTS: ${guidelineFtsCount})`);

    db.close();
  }

  // Save final state
  state.completed = Array.from(completedSet);
  state.lastRun = new Date().toISOString();
  saveState(state);

  log(`\nIngestion complete. State saved to ${resolve(STATE_PATH)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
