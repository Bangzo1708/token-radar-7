// Token Launch Radar — token-radar-01, round 7.
//
// Reads /input/snapshot.json (DefiLlama protocol snapshot), ranks every
// pre-token protocol by an implied launch value, and writes a dashboard.
//
// VALUE MODEL (Comparable-Multiple, variant A — see VARIANTS.md):
//   implied = TVL x category multiple x growth x breadth x launch-prob x 7%
//   - category multiple: median mcap/TVL of the protocols IN THE SAME CATEGORY
//     that already have a token trading (gecko_id recorded, mcap_usd > 0).
//     Categories with fewer than 2 token comparables fall back to the global
//     median multiple. Nothing is hardcoded by protocol name.
//   - growth: 1 + 0.5 * clamp(change_7d, -25, +40) / 100
//   - breadth: min(1.25, 1 + 0.03 * (chains - 1))
//   - launch-prob: min(0.80, 0.38 + 0.0004 * age_days) — age is the days since
//     DefiLlama first tracked the protocol; no listed_at means 365 days.
//   - 7%: the community-allocation share of a launch's fully diluted value.
// The board holds every pre-token protocol that passes the watchlist's own
// exclusion rule (no CEX / Bridge / Liquid (Re)Staking / Restaked BTC, no
// wrapped or staked product, no version-marked name, no exchange-prefixed
// name): 198 rows on this snapshot, including all 40 watchlist slugs.
// A protocol "records no token" — the snapshot is DefiLlama's record, not
// proof that no token exists.
//
// Node 22, standard library only. All repo-relative paths resolve from this
// file's own directory (never from the working directory), so the program
// runs identically from any cwd.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  multiple: number;
  growth_factor: number;
  breadth_factor: number;
  launch_prob: number;
  watchlist: boolean;
  signals: string[];
  farm_steps: string[];
}

const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

const ALLOC_SHARE = 0.07;
const AS_OF = '2026-11-14';

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function ageDays(p: Protocol): number {
  if (!p.listed_at) return 365;
  const listed = Date.parse(p.listed_at + 'T00:00:00Z');
  const asOf = Date.parse(AS_OF + 'T00:00:00Z');
  return Math.max(0, Math.round((asOf - listed) / 86400000));
}

/** The watchlist's own exclusion rule, applied to every pre-token protocol. */
function excluded(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

function money(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** Category-specific core action: what "using the protocol" concretely means. */
function coreAction(category: string, name: string, chain: string): string {
  switch (category) {
    case 'Dexs':
      return `Swap on ${name} on ${chain} at least twice a week, using different token pairs and sizes between $25 and $200 per swap, and add a small amount of liquidity to one pool for 2+ weeks.`;
    case 'Lending':
      return `Supply $50-$300 of collateral on ${name} on ${chain}, borrow a small amount against it, repay it, then repeat the supply-borrow-repay cycle once a month so the position stays active.`;
    case 'RWA':
      return `Buy a small position in a tokenised real-world asset vault on ${name} on ${chain} ($50-$200), hold it for at least 30 days, and reinvest any yield it pays back into the same vault.`;
    case 'Risk Curators':
      return `Deposit $50-$300 into a curated vault on ${name} on ${chain}, keep the deposit for at least 30 days, and reallocate once between two different curators to show active vault management.`;
    case 'Derivatives':
    case 'Perps':
      return `Open two small perpetual positions on ${name} on ${chain} ($25-$100 margin each, low leverage), close them after a few days, and repeat monthly rather than trading every day.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit $50-$200 into the highest-TVL yield vault on ${name} on ${chain}, leave it compounding for 30+ days, and harvest or restake the yield at least once during that period.`;
    case 'CDP':
      return `Mint a small amount of the protocol's stable asset on ${name} on ${chain} against $100-$300 of collateral, keep the collateral ratio above 200%, and repay part of the debt after two weeks.`;
    case 'Payments':
      return `Use ${name} on ${chain} to send or receive at least three payments of $20-$100 each over two weeks, to different counterparties, and keep a small balance in the account between payments.`;
    case 'Liquid Restaking':
    case 'Restaking':
      return `Restake $50-$200 of liquid staking tokens through ${name} on ${chain}, hold the restaked position for 30+ days, and delegate to two different operators if the interface allows it.`;
    default:
      return `Use the core feature of ${name} on ${chain} at least twice a week for a month — deposit, swap, stake or lend $50-$200 per session — and keep the position open rather than withdrawing immediately.`;
  }
}

function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const chainList = p.chains.slice(0, 3).join(', ');
  const cat = p.category ?? 'DeFi';
  const tvl = money(p.tvl_usd);
  return [
    `Set up a fresh wallet for farming and fund it on ${chain} with $100-$300 in the chain's native gas token plus stablecoins; keep this wallet separate from your main holdings and write down the seed phrase offline.`,
    `Open the official ${p.name} app and connect the farming wallet on ${chain} (TVL ${tvl}, category ${cat}); check the app shows the same name and TVL before approving anything, and never connect through links from social media.`,
    coreAction(cat, p.name, chain),
    `Repeat the activity weekly for 4-8 weeks on ${chainList} where the protocol runs, varying amounts and days so the activity looks like real use; log each session's date, amount and transaction hash in a simple sheet.`,
    `Track your position and any points or quests the protocol shows in its own dashboard, screenshot the dashboard weekly, and withdraw only after at least 30 days of activity so the farming history is not cut short.`,
  ];
}

function signalsFor(p: Protocol, age: number): string[] {
  const signals: string[] = [];
  if (age < 365 && (p.change_7d ?? 0) > 5) signals.push('Early mover');
  if ((p.change_7d ?? 0) > 10) signals.push('Momentum');
  if (p.chains.length >= 5) signals.push('Multi-chain');
  if (p.tvl_usd >= 500_000_000) signals.push('Large TVL');
  if (age >= 730) signals.push('Seasoned');
  return signals;
}

function buildBoard(snap: Snapshot): BoardRow[] {
  const byCategory = new Map<string, number[]>();
  const allMultiples: number[] = [];
  for (const p of snap.protocols) {
    if (p.gecko_id === null || !p.mcap_usd || !p.tvl_usd) continue;
    const multiple = p.mcap_usd / p.tvl_usd;
    allMultiples.push(multiple);
    const key = p.category ?? 'Unknown';
    const list = byCategory.get(key) ?? [];
    list.push(multiple);
    byCategory.set(key, list);
  }
  // Guard: a snapshot with no traded-token comparables at all must still
  // price (median of an empty list is NaN, which would poison every row).
  const globalMultiple = allMultiples.length > 0 ? median(allMultiples) : 0.2;
  const categoryMultiple = new Map<string, number>();
  for (const [cat, values] of byCategory) {
    categoryMultiple.set(cat, values.length >= 2 ? median(values) : globalMultiple);
  }

  const watchlist = new Set(snap.watchlist);
  const rows: BoardRow[] = [];
  for (const p of snap.protocols) {
    if (hasToken(p)) continue;
    if (excluded(p)) continue;
    const multiple = categoryMultiple.get(p.category ?? 'Unknown') ?? globalMultiple;
    const growth = 1 + (0.5 * clamp(p.change_7d ?? 0, -25, 40)) / 100;
    const breadth = Math.min(1.25, 1 + 0.03 * Math.max(0, p.chains.length - 1));
    const age = ageDays(p);
    const launchProb = Math.min(0.8, 0.38 + 0.0004 * age);
    const implied = Math.max(
      1,
      Math.round(p.tvl_usd * multiple * growth * breadth * launchProb * ALLOC_SHARE),
    );
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      multiple: Math.round(multiple * 10000) / 10000,
      growth_factor: Math.round(growth * 10000) / 10000,
      breadth_factor: Math.round(breadth * 10000) / 10000,
      launch_prob: Math.round(launchProb * 10000) / 10000,
      watchlist: watchlist.has(p.slug),
      signals: signalsFor(p, age),
      farm_steps: farmSteps(p),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

function main(): void {
  const args = process.argv.slice(2);
  let inputPath = '/input/snapshot.json';
  let outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) inputPath = args[++i]!;
    else if (args[i] === '--output' && args[i + 1]) outputDir = args[++i]!;
  }
  if (!existsSync(inputPath)) {
    const fallback = join(HERE, '..', 'input', 'snapshot.json');
    if (existsSync(fallback)) inputPath = fallback;
  }
  const snap = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
  const rows = buildBoard(snap);
  // Fail loudly instead of handing in a board that misses the watchlist or
  // carries an out-of-range farm plan — the gate would refuse it anyway.
  const missing = snap.watchlist.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length > 0) throw new Error(`watchlist not covered: ${missing.join(', ')}`);
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`farm_steps out of range for ${r.slug}`);
    }
    for (const step of r.farm_steps) {
      if (step.trim().length < 20 || step.trim().length > 600) {
        throw new Error(`farm step length out of range for ${r.slug}`);
      }
    }
  }
  const totalImplied = rows.reduce((sum, r) => sum + r.implied_value_usd, 0);

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

  const board = {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    model:
      'Comparable-Multiple: implied = TVL x category-median mcap/TVL multiple x growth x breadth x launch-prob x 7%. ' +
      'Comparables are same-category protocols with a token trading; categories with <2 comparables use the global median multiple.',
    rows_count: rows.length,
    watchlist_count: rows.filter((r) => r.watchlist).length,
    total_implied_value_usd: totalImplied,
    rows,
  };
  writeFileSync(join(outputDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');

  // Dashboard files live beside main.ts; copy them, then write the compact data file.
  copyTree(join(HERE, 'dashboard'), join(outputDir, 'dashboard'));
  const compactRows = rows.map((r) => [
    r.slug,
    r.name,
    r.category,
    r.chains.join('|'),
    r.tvl_usd,
    r.change_7d,
    r.age_days,
    r.implied_value_usd,
    r.multiple,
    r.growth_factor,
    r.breadth_factor,
    r.launch_prob,
    r.watchlist ? 1 : 0,
    r.signals.join('|'),
  ]);
  const dataJs =
    'window.RADAR = ' +
    JSON.stringify({
      asOf: snap.as_of,
      floorUsd: snap.floor_usd,
      totalImplied,
      rows: compactRows,
    }) +
    ';\n';
  writeFileSync(join(outputDir, 'dashboard', 'data.js'), dataJs, 'utf8');

  copyTree(join(HERE, 'screenshots'), join(outputDir, 'screenshots'));

  writeFileSync(
    join(outputDir, 'dossier.json'),
    buildDossier(outputDir, { text_max_bytes: 65536 }),
  );

  console.log(
    `token-radar-01 r7: ${rows.length} rows, rank 1 ${rows[0]?.slug} $${rows[0]?.implied_value_usd}, ` +
      `total implied $${totalImplied}, watchlist ${board.watchlist_count}/${snap.watchlist.length}`,
  );
}

main();
