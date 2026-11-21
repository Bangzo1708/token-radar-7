# Varian model — token-radar-01 round 7

Semua varian memakai kerangka yang sama (Comparable-Multiple):
`implied = TVL × multiple median kategori dari comparables × growth × breadth × launch-prob × 7%`.
Comparables = protokol se-kategori yang sudah punya token (dari snapshot: `gecko_id`
tercatat dan `mcap_usd` > 0); multiple = `mcap_usd / tvl_usd`, median per kategori,
fallback median global (0,205) bila kategori punya < 2 comparables. Board = semua
protokol pre-token yang lolos saringan watchlist (bukan CEX/Bridge/Liquid Staking/
Restaking, bukan produk wrapped/staked, bukan nama berversi/awalan exchange):
198 baris, sudah mencakup ke-40 watchlist.

## Varian A — Comparable-Multiple murni, faktor ringan (MENANG)
- growth `1 + 0,5·clamp(change_7d, −25, +40)/100`; breadth `min(1,25; 1 + 0,03·(chains−1))`;
  launch-prob `min(0,80; 0,38 + 0,0004·umur_hari)`.
- Rank 1: Steakhouse Financial — **$29.164.282**. Total implied 198 baris: **$200.030.018**.
- Top 5: Steakhouse Financial, Sentora Curator, Gauntlet, Extended Perps, USDD.

## Varian B — Comparable-Multiple + growth/breadth kuat + sinyal early
- growth ×1,2, breadth sampai 1,50, launch sampai 0,90, bonus ×1,25 untuk protokol
  muda (< 365 hari) yang tumbuh positif.
- Rank 1: Steakhouse Financial — **$41.873.040**. Total: **$261.918.809**.
- Dinilai: angka mengembang 30% di atas A tanpa bukti baru dari snapshot — faktor
  yang saling menumpuk (growth kuat + breadth besar + bonus early) membuat implied
  tidak lagi bisa dipertahankan sebagai "nilai wajar" sebuah launch.

## Varian C — Comparable-Multiple + penekanan watchlist/farmability
- Sama dengan A, ditambah pengali ×1,35 untuk 40 protokol watchlist.
- Rank 1: Steakhouse Financial — **$45.776.617**. Total: **$274.511.762**.
- Dinilai: pengali watchlist bersifat sirkular — watchlist sudah dibentuk dari
  TVL ≥ $50jt dan status pre-token, jadi mengalikannya lagi menggandakan sinyal
  yang sama; peringkat dalam watchlist ikut terdistorsi terhadap protokol early
  di bawah floor yang radar ini justru ada untuk menemukannya.

## Pilihan: Varian A
Kriteria: (1) paling nempel brief — implied mengikuti angka snapshot sendiri
(TVL, pertumbuhan 7 hari, umur tanpa token, sebaran chain) tanpa daftar nama
hardcode; (2) paling orisinal — bukan tabel TVL: multiple per kategori membuat
Risk Curators, RWA, dan Perps dinilai dengan pembandingnya sendiri, dan saringan
watchlist yang sama dipakai untuk menemukan 158 protokol early di bawah floor;
(3) paling berkesan di pandangan pertama — rank 1 langsung terlihat wajar
($29jt dari TVL $2,75 miliar, bukan miliaran), total board $200jt masih dalam
skala yang bisa dibaca sebagai nilai airdrop agregat, bukan fantasi.
Angka membumi dan bisa dipertahankan: 7% adalah porsi alokasi komunitas yang
lazim, multiple median kategori 0,04–1,22 berasal dari token yang sudah
diperdagangkan, dan setiap faktor dibatasi (growth ±, breadth ≤ 1,25,
launch-prob ≤ 0,80) sehingga tidak ada satu protokol pun yang meledak.
