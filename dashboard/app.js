// Token Radar dashboard. Data comes from data.js (window.RADAR), written by
// main.ts from the sealed snapshot. Farm steps are generated here from the
// protocol's own category and chains, with the same templates main.ts uses
// for board.json, so the page and the board always agree.
(function () {
  'use strict';
  var D = window.RADAR || { rows: [] };
  // Row: [slug,name,category,chains,tvl,change7d,ageDays,implied,multiple,
  //       growthFactor,breadthFactor,launchProb,watchlist,signals]
  function rowObj(a) {
    return { slug: a[0], name: a[1], category: a[2], chains: a[3] ? a[3].split('|') : [],
      tvl: a[4], change: a[5], age: a[6], implied: a[7], multiple: a[8],
      growth: a[9], breadth: a[10], launch: a[11], watchlist: a[12] === 1,
      signals: a[13] ? a[13].split('|') : [] };
  }
  var rows = D.rows.map(rowObj);

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function coreAction(category, name, chain) {
    switch (category) {
      case 'Dexs':
        return 'Swap on ' + name + ' on ' + chain + ' at least twice a week, using different token pairs and sizes between $25 and $200 per swap, and add a small amount of liquidity to one pool for 2+ weeks.';
      case 'Lending':
        return 'Supply $50-$300 of collateral on ' + name + ' on ' + chain + ', borrow a small amount against it, repay it, then repeat the supply-borrow-repay cycle once a month so the position stays active.';
      case 'RWA':
        return 'Buy a small position in a tokenised real-world asset vault on ' + name + ' on ' + chain + ' ($50-$200), hold it for at least 30 days, and reinvest any yield it pays back into the same vault.';
      case 'Risk Curators':
        return 'Deposit $50-$300 into a curated vault on ' + name + ' on ' + chain + ', keep the deposit for at least 30 days, and reallocate once between two different curators to show active vault management.';
      case 'Derivatives':
      case 'Perps':
        return 'Open two small perpetual positions on ' + name + ' on ' + chain + ' ($25-$100 margin each, low leverage), close them after a few days, and repeat monthly rather than trading every day.';
      case 'Yield':
      case 'Yield Aggregator':
        return 'Deposit $50-$200 into the highest-TVL yield vault on ' + name + ' on ' + chain + ', leave it compounding for 30+ days, and harvest or restake the yield at least once during that period.';
      case 'CDP':
        return 'Mint a small amount of the protocol\'s stable asset on ' + name + ' on ' + chain + ' against $100-$300 of collateral, keep the collateral ratio above 200%, and repay part of the debt after two weeks.';
      case 'Payments':
        return 'Use ' + name + ' on ' + chain + ' to send or receive at least three payments of $20-$100 each over two weeks, to different counterparties, and keep a small balance in the account between payments.';
      case 'Liquid Restaking':
      case 'Restaking':
        return 'Restake $50-$200 of liquid staking tokens through ' + name + ' on ' + chain + ', hold the restaked position for 30+ days, and delegate to two different operators if the interface allows it.';
      default:
        return 'Use the core feature of ' + name + ' on ' + chain + ' at least twice a week for a month — deposit, swap, stake or lend $50-$200 per session — and keep the position open rather than withdrawing immediately.';
    }
  }

  function farmSteps(p) {
    var chain = p.chains[0] || 'Ethereum';
    var chainList = p.chains.slice(0, 3).join(', ');
    var cat = p.category || 'DeFi';
    return [
      'Set up a fresh wallet for farming and fund it on ' + chain + ' with $100-$300 in the chain\'s native gas token plus stablecoins; keep this wallet separate from your main holdings and write down the seed phrase offline.',
      'Open the official ' + p.name + ' app and connect the farming wallet on ' + chain + ' (TVL ' + money(p.tvl) + ', category ' + cat + '); check the app shows the same name and TVL before approving anything, and never connect through links from social media.',
      coreAction(cat, p.name, chain),
      'Repeat the activity weekly for 4-8 weeks on ' + chainList + ' where the protocol runs, varying amounts and days so the activity looks like real use; log each session\'s date, amount and transaction hash in a simple sheet.',
      'Track your position and any points or quests the protocol shows in its own dashboard, screenshot the dashboard weekly, and withdraw only after at least 30 days of activity so the farming history is not cut short.'
    ];
  }

  var state = { q: '', category: '', chain: '', filter: 'all', sort: 'implied', selected: null };

  var cats = Array.from(new Set(rows.map(function (r) { return r.category; }))).sort();
  var chains = Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort();
  var catSel = document.getElementById('category');
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });

  function filtered() {
    var list = rows.filter(function (r) {
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (r.name + ' ' + r.category + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.filter === 'watchlist' && !r.watchlist) return false;
      if (state.filter === 'early' && r.signals.indexOf('Early mover') === -1) return false;
      if (state.filter === 'momentum' && r.signals.indexOf('Momentum') === -1) return false;
      if (state.filter === 'multichain' && r.signals.indexOf('Multi-chain') === -1) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied - a.implied; },
      tvl: function (a, b) { return b.tvl - a.tvl; },
      growth: function (a, b) { return (b.change || 0) - (a.change || 0); },
      age: function (a, b) { return a.age - b.age; }
    }[state.sort];
    return list.sort(by);
  }

  function render() {
    var list = filtered();
    var tbody = document.getElementById('rows');
    document.getElementById('count').textContent =
      list.length + ' of ' + rows.length + ' pre-token protocols · ranked by implied launch value · snapshot ' + D.asOf;
    tbody.innerHTML = list.map(function (r, i) {
      var chg = r.change === null ? '—' : (r.change >= 0 ? '+' : '') + r.change.toFixed(1) + '%';
      var cls = r.change === null ? '' : (r.change >= 0 ? 'up' : 'down');
      var sig = (r.watchlist ? '<span class="badge wl">★ Watchlist</span>' : '') +
        r.signals.map(function (s) { return '<span class="badge">' + esc(s) + '</span>'; }).join('');
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl) + '</td>' +
        '<td class="num ' + cls + '">' + chg + '</td>' +
        '<td class="num implied">' + money(r.implied) + '</td>' +
        '<td>' + sig + '</td></tr>';
    }).join('');
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  function showDetail(slug) {
    state.selected = slug;
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var steps = farmSteps(r);
    var el = document.getElementById('detail');
    el.innerHTML =
      '<h2>#' + (rows.indexOf(r) + 1) + ' · ' + esc(r.name) + '</h2>' +
      '<p>' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) + ' · tracked ' + r.age + ' days with no token recorded · ' +
      (r.watchlist ? 'on the $50M watchlist. ' : 'below the $50M watchlist floor — an early find. ') +
      'Implied launch value <b>' + money(r.implied) + '</b>.</p>' +
      '<div class="breakdown">' +
      '<span class="factor">TVL<b>' + money(r.tvl) + '</b></span>' +
      '<span class="factor">Category multiple<b>× ' + r.multiple + '</b></span>' +
      '<span class="factor">Growth 7d<b>× ' + r.growth + '</b></span>' +
      '<span class="factor">Breadth (' + r.chains.length + ' chains)<b>× ' + r.breadth + '</b></span>' +
      '<span class="factor">Launch prob.<b>× ' + r.launch + '</b></span>' +
      '<span class="factor">Community share<b>× 7%</b></span>' +
      '<span class="factor">Implied value<b>' + money(r.implied) + '</b></span></div>' +
      '<h3>How to farm it — 5 steps</h3><ol class="steps">' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="sub">Signals: ' + (r.signals.length ? esc(r.signals.join(', ')) : 'none') +
      ' · 7-day TVL change: ' + (r.change === null ? 'not reported' : r.change + '%') +
      ' · This is the radar\u2019s own estimate, not a promise a token will launch.</p>';
    render();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('search').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    state.filter = b.getAttribute('data-filter');
    document.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === b); });
    render();
  });

  var total = D.totalImplied || rows.reduce(function (s, r) { return s + r.implied; }, 0);
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>Pre-token protocols</span></div>' +
    '<div class="stat"><b>' + rows.filter(function (r) { return r.watchlist; }).length + '</b><span>Watchlist covered</span></div>' +
    '<div class="stat"><b>' + money(total) + '</b><span>Total implied value</span></div>' +
    '<div class="stat"><b>' + money(rows[0] ? rows[0].implied : 0) + '</b><span>Rank 1 · ' + esc(rows[0] ? rows[0].name : '') + '</span></div>';
  document.getElementById('asof').textContent = D.asOf || '';

  // Deep links for screenshots and sharing: #detail=<slug>, #filter=<name>.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('filter')) {
    state.filter = hash.get('filter');
    document.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('on', c.getAttribute('data-filter') === state.filter);
    });
  }
  render();
  if (hash.get('detail')) showDetail(hash.get('detail'));
})();
