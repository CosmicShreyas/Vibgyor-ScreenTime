/**
 * Application & website productivity categorization and scoring.
 *
 * Implements the reporting recommendations: classify activity into
 * productive / neutral / unproductive buckets, derive a per-employee
 * productivity score, and extract website/domain usage from browser tabs.
 *
 * Categories are heuristic and configurable via APP_CATEGORIES_JSON (a JSON map
 * of { "keyword": "productive"|"neutral"|"unproductive" }) which is merged over
 * the built-in defaults.
 */

export type Category = 'productive' | 'neutral' | 'unproductive';

// Built-in defaults. Keys are lowercase substrings matched against the app name
// or the tab's domain/title.
const DEFAULT_RULES: Record<string, Category> = {
  // Productive
  excel: 'productive',
  word: 'productive',
  winword: 'productive',
  powerpoint: 'productive',
  outlook: 'productive',
  teams: 'productive',
  autocad: 'productive',
  photoshop: 'productive',
  code: 'productive',
  'visual studio': 'productive',
  erp: 'productive',
  'bolt-erp': 'productive',
  tally: 'productive',
  slack: 'productive',
  zoom: 'productive',
  jira: 'productive',
  notion: 'productive',
  figma: 'productive',
  gmail: 'productive',
  'mail.google': 'productive',
  'docs.google': 'productive',
  'sheets.google': 'productive',
  github: 'productive',
  gitlab: 'productive',
  stackoverflow: 'productive',

  // Neutral
  chrome: 'neutral',
  firefox: 'neutral',
  edge: 'neutral',
  msedge: 'neutral',
  explorer: 'neutral',
  'google search': 'neutral',
  'google.com': 'neutral',
  bing: 'neutral',
  whatsapp: 'neutral',

  // Unproductive
  netflix: 'unproductive',
  youtube: 'unproductive',
  facebook: 'unproductive',
  instagram: 'unproductive',
  twitter: 'unproductive',
  'x.com': 'unproductive',
  reddit: 'unproductive',
  primevideo: 'unproductive',
  hotstar: 'unproductive',
  spotify: 'unproductive',
  tiktok: 'unproductive',
  game: 'unproductive',
  steam: 'unproductive',
};

let cachedRules: Record<string, Category> | null = null;

function getRules(): Record<string, Category> {
  if (cachedRules) return cachedRules;
  let rules = { ...DEFAULT_RULES };
  const raw = process.env.APP_CATEGORIES_JSON;
  if (raw) {
    try {
      const overrides = JSON.parse(raw) as Record<string, Category>;
      for (const [k, v] of Object.entries(overrides)) {
        rules[k.toLowerCase()] = v;
      }
    } catch {
      // Ignore malformed overrides; fall back to defaults.
    }
  }
  cachedRules = rules;
  return rules;
}

/** Classify an application name or website/title into a productivity category. */
export function categorize(nameOrDomain: string): Category {
  const s = (nameOrDomain || '').toLowerCase();
  const rules = getRules();
  for (const [keyword, category] of Object.entries(rules)) {
    if (s.includes(keyword)) return category;
  }
  // Default: treat unknown apps as neutral rather than penalizing them.
  return 'neutral';
}

/** Extract a hostname/domain from a URL, or '' if not a parseable URL. */
export function domainFromUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url.includes('://') ? url : `http://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface CategoryBreakdown {
  productive: number;
  neutral: number;
  unproductive: number;
}

export interface WebsiteUsage {
  domain: string;
  duration: number;
  visits: number;
  category: Category;
}

export interface ProductivityResult {
  /** 0-100. Productive time as a share of categorized active time. */
  score: number;
  categorySeconds: CategoryBreakdown;
  websites: WebsiteUsage[];
}

/**
 * Compute productivity metrics from aggregated application and browser-tab usage.
 *
 * @param apps      [{ name, duration(seconds) }]
 * @param tabs      [{ title, url, duration(seconds) }]
 */
export function computeProductivity(
  apps: Array<{ name: string; duration: number }>,
  tabs: Array<{ title?: string; url?: string; duration: number }>
): ProductivityResult {
  const categorySeconds: CategoryBreakdown = { productive: 0, neutral: 0, unproductive: 0 };

  for (const app of apps) {
    const cat = categorize(app.name);
    categorySeconds[cat] += Math.max(0, app.duration || 0);
  }

  // Aggregate website usage by domain from browser tabs.
  const siteMap = new Map<string, WebsiteUsage>();
  for (const tab of tabs) {
    const domain = domainFromUrl(tab.url || '') || (tab.title || 'unknown');
    const cat = categorize(domain || tab.title || '');
    const existing = siteMap.get(domain);
    if (existing) {
      existing.duration += Math.max(0, tab.duration || 0);
      existing.visits += 1;
    } else {
      siteMap.set(domain, {
        domain,
        duration: Math.max(0, tab.duration || 0),
        visits: 1,
        category: cat,
      });
    }
  }

  const websites = Array.from(siteMap.values()).sort((a, b) => b.duration - a.duration);

  // Score: productive share of all categorized time. Neutral counts as half so a
  // day of browsing isn't scored the same as focused productive work.
  const { productive, neutral, unproductive } = categorySeconds;
  const denom = productive + neutral + unproductive;
  const score = denom > 0 ? Math.round(((productive + neutral * 0.5) / denom) * 100) : 0;

  return { score, categorySeconds, websites };
}
