# Wave 8.5 Display Mobile Overlap Staging QA

Tanggal: 2026-08-26
Environment: DIIS staging
Peran: Executor QA follow-up
Scope: hotfix mobile display overlap pada `RoomDisplay`

## Verdict

**PASS untuk targeted staging QA mobile overlap.**

Hotfix mencegah kartu sesi mobile runtuh, terpotong, atau tertimpa panel berikutnya.
Layout desktop/43-inch tetap memakai grid display penuh; perubahan mobile memakai alur
vertikal yang dapat discroll.

## Git dan Deploy

- Source PR: #578
- Source head: `f90098a493ae0ed81c8e1405115644dfd3f3f393`
- Develop merge: `7b7143821ae5bd2c0d3bb6251a63af7e086c2ea2`
- Staging PR: #579
- Staging merge: `3d4d0c7b0684ba9fca0cf77eed263885be90e760`
- Deploy run: `32954797150`, success
- VPS checkout saat QA: `1fcc2085f8798232d7997b6e67f4e12f25d06477`
- Tree deployed checkout dan `origin/staging` sama: `14dffedb2a94aabda74891c861994c2616215506`
- `smk-staging-api`: healthy
- `smk-staging-web`: running
- `main` tetap: `7c5066c9453f8a542f2bf4f93cdd69e8d0a69b0e`

## Source Verification

- Focused web display boundary: 21/21 pass
- Web type-check: pass
- Web lint: pass, hanya warning deprecation/plugin Next yang sudah ada
- Web build: pass, 47/47 halaman
- `git diff --check`: pass

## Staging Browser QA

Target URL: `https://staging.smkdarussalamsubah.sch.id/display/room`

Controlled staging-browser harness:

- Dual tab audio: `claimAttempts=2`, `playedAttempts=1`, `releaseAttempts=1`
- Alert speech: 1 tab saja berbicara
- Voice config test dan alert: `lang=id-ID`, `rate=0.92`, voice `Google Bahasa Indonesia`
- Failure drill: first attempt tetap `PENDING`, retry menjadi `PLAYED`, reload tidak replay
- Rotation:
  - Next pada rotasi aktif menjeda halaman
  - Setelah Play, siklus 12 detik baru berjalan
- Desktop 1920x1080:
  - `scrollWidth=1920`
  - `bodyScrollWidth=1920`
  - tidak ada target aksi di bawah 44px
- Mobile 390x844:
  - `scrollWidth=390`
  - `bodyScrollWidth=390`
  - `noHorizontalOverflow=true`
  - core display visible
- Bad display responses: 0

Console caveat: staging masih menampilkan warning CSP untuk Cloudflare Insights
`static.cloudflareinsights.com`. Warning ini bukan error display dan sudah terlihat sebagai
platform-level CSP issue sebelumnya.

## Overlap Proof 390x844

Pengukuran dilakukan pada staging URL dengan snapshot sintetis PII-safe berisi 15 sesi.
Halaman diuji pada viewport awal dan setelah scroll ke bagian bawah.

Metrik viewport awal:

- Viewport: `390x844`
- `documentWidth=390`
- `bodyWidth=390`
- `noHorizontalOverflow=true`
- `sessionCardCount=6`
- `minSessionCardHeight=144`
- `maxSessionCardHeight=144`
- `consecutiveOverlaps=[]`
- `cardPairOverlaps=[]`
- `childOverflow=[]`
- `connectionOverlapsCards=[]`
- Panel Koneksi mulai pada `top=1232`, sedangkan kartu sesi keenam selesai pada `bottom=1202`

Metrik setelah scroll bawah:

- `noHorizontalOverflow=true`
- container utama dapat discroll: `scrollHeight=1743`, `clientHeight=678`
- `connectionOverlapsCards=[]`
- Blok Kehadiran, Kalender, dan Pengumuman tampil tanpa menimpa kartu sesi

Screenshot PII-safe tersimpan lokal di `.tmp/wave85-display-staging-qa-20260826/`:

- `wave85-mobile-overlap-proof-390.png`
  - SHA-256: `1eafcb5371566d85ddf834a575b53fb40119bec79b907a235f5fb5c612bf849f`
- `wave85-mobile-overlap-proof-390-bottom.png`
  - SHA-256: `2fbe3bf82a9e7021b5debd4c802edf9f31f7541031156fda502fe84972f55fae`
- `evidence.json`
  - berisi controlled audio, rotation, desktop/mobile, dan network evidence

## Protection dan Containment

- Develop classic required approvals: restored to 1
- Staging classic required approvals: restored to 1
- Main classic required approvals: remains 1
- Staging ruleset `Protect Staging`: restored to 1 approval
- Main ruleset `Protect main`: remains 1 approval
- Tidak ada PR terbuka setelah merge
- Tidak ada production container, database, timer, Keycloak, atau `main` yang diubah
- `.tmp` evidence tidak distage dan tidak masuk commit

## Kesimpulan

Targeted hotfix mobile overlap sudah tervalidasi pada staging deployed tree. Tidak ada overlap
teks, overlap antar kartu sesi, overlap kartu dengan panel Koneksi, atau horizontal overflow
pada 390x844. Desktop display, audio coordination, retry/reload, dan rotation tetap lulus pada
controlled staging browser QA.

Status: siap untuk independent reviewer staging re-check atas hotfix mobile overlap. Promosi
ke `main` tetap gate terpisah.
