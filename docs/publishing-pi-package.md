# Panduan Praktis: Mempublikasikan Package Pi

Panduan ini mendokumentasikan alur lengkap untuk membuat, mempublikasikan, dan merilis [`pi-commit-split`](https://github.com/ismailokta/pi-commit-split) sebagai package Pi.

Proses yang sama dapat digunakan untuk extension, skill, prompt template, dan theme Pi.

## 1. Tentukan ruang lingkup package

Pisahkan repository package dari repository aplikasi tempat extension awalnya dibuat.

Contoh:

```text
Repository aplikasi    Bitbucket: myunnes-kerjasama
Repository package     GitHub: ismailokta/pi-commit-split
Package npm            pi-commit-split
```

Package sebaiknya cukup umum untuk penggunanya. `pi-commit-split` dapat digunakan pada repository Git apa pun; package ini tidak bergantung pada Laravel, PHP, atau aplikasi tertentu.

## 2. Buat struktur package

Struktur minimalnya:

```text
pi-commit-split/
├── extensions/
│   └── commit-workflow.ts
├── docs/
│   └── publishing-pi-package.md
├── .github/
│   └── workflows/
│       └── publish.yml
├── LICENSE
├── README.md
└── package.json
```

Pi akan menemukan extension dari direktori `extensions/`. Manifest `pi` di `package.json` membuat entry point package menjadi eksplisit dan tidak ambigu.

## 3. Atur `package.json`

Contoh:

```json
{
  "name": "pi-commit-split",
  "version": "0.1.0",
  "description": "Adaptive topic-based commit and push workflow for Pi",
  "keywords": ["pi-package", "pi", "git", "commit"],
  "license": "MIT",
  "files": [
    "extensions",
    "docs",
    "README.md",
    "LICENSE",
    "package.json"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/ismailokta/pi-commit-split"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  "pi": {
    "extensions": [
      "./extensions/commit-workflow.ts"
    ]
  }
}
```

Hal penting:

- Keyword `pi-package` membuat package npm publik memenuhi syarat untuk Pi Package Gallery.
- Package Pi yang disediakan Pi sebaiknya ditulis di `peerDependencies`, bukan dibundel sebagai dependency biasa.
- Daftar `files` mencegah file yang tidak diperlukan ikut masuk ke tarball npm.
- Gunakan semantic version seperti `0.1.0`, `0.1.1`, dan `1.0.0`.

## 4. Uji package secara lokal

Dari direktori package:

```bash
npm pack --dry-run
```

Pastikan hanya file yang diperlukan yang tercantum. Uji extension tanpa menginstalnya:

```bash
pi -e ./extensions/commit-workflow.ts
```

Uji struktur package yang sebenarnya dari sesi Pi bersih atau direktori pengujian lain:

```bash
pi install ./path/to/pi-commit-split
```

Untuk package ini, pastikan command berikut tersedia:

```text
/commit-split
/commit-push
Ctrl+Shift+C
Ctrl+Shift+P
```

Extension harus tetap memiliki pengamanan Git berikut:

- Jangan gunakan `git add .` atau `git add -A`.
- Jangan melakukan force-push.
- Tolak proses jika index sudah memiliki staged changes.
- Minta pilihan eksplisit melalui TUI sebelum commit.
- Tinjau topic dan commit message yang dihasilkan sebelum commit atau push.

## 5. Buat dan push repository GitHub

Login ke GitHub CLI jika diperlukan:

```bash
gh auth login
```

Buat repository dari direktori package lokal:

```bash
git init -b main
git add .
git commit -m "feat: add Pi commit split package"
gh repo create USERNAME/pi-commit-split \
  --public \
  --description "Adaptive topic-based commit and push workflow for Pi" \
  --source . \
  --remote origin \
  --push
```

Atau hubungkan ke repository yang sudah ada:

```bash
git remote add origin https://github.com/USERNAME/pi-commit-split.git
git push -u origin main
```

Periksa hasilnya:

```bash
gh repo view USERNAME/pi-commit-split
git status --short --branch
```

### Ketidaksesuaian akun SSH dan GitHub CLI

Autentikasi GitHub CLI dan autentikasi Git SSH dapat menggunakan akun yang berbeda. Jika push SSH masuk ke akun yang salah, gunakan remote HTTPS setelah login melalui GitHub CLI:

```bash
gh auth setup-git
git remote set-url origin https://github.com/USERNAME/pi-commit-split.git
git push -u origin main
```

Jangan menaruh access token di URL remote atau file yang di-commit.

## 6. Publish versi npm pertama

Login ke npm:

```bash
npm login --auth-type=web
npm whoami
```

Publish versi publik pertama:

```bash
npm publish --access public
```

Verifikasi package:

```bash
npm view pi-commit-split version
```

Halaman package:

```text
https://www.npmjs.com/package/pi-commit-split
```

Instal melalui Pi:

```bash
pi install npm:pi-commit-split
```

Package Pi tidak memerlukan login terpisah ke `pi.dev`. Package npm publik dan keyword `pi-package` sudah menjadi dasar package untuk masuk ke ekosistem package Pi.

## 7. Atur npm Trusted Publishing

Setup CI yang disarankan menggunakan npm Trusted Publishing melalui GitHub Actions, bukan menyimpan npm token di GitHub Secrets.

Di npm:

1. Buka pengaturan package `pi-commit-split`.
2. Buka **Trusted Publishers**.
3. Tambahkan GitHub Actions sebagai provider.
4. Isi owner repository dengan `USERNAME`.
5. Isi repository dengan `pi-commit-split`.
6. Isi workflow file dengan `.github/workflows/publish.yml`.
7. Biarkan environment kosong kecuali workflow memang menggunakannya.

Trusted publishing memerlukan workflow dengan permission `id-token: write`.

## 8. Tambahkan GitHub Actions untuk publish

Buat file `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: read
  id-token: write

concurrency:
  group: npm-publish-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org

      - name: Verify tag matches package version
        shell: bash
        run: |
          version="$(node -p "require('./package.json').version")"
          expected="v${version}"
          if [[ "${GITHUB_REF_NAME}" != "${expected}" ]]; then
            echo "Tag ${GITHUB_REF_NAME} does not match package version ${expected}."
            exit 1
          fi

      - name: Publish package
        run: npm publish --provenance --access public
```

Pengecekan versi mencegah package dengan versi yang salah dipublikasikan menggunakan tag yang tidak sesuai.

## 9. Rilis versi baru

Setelah pull request di-merge ke `main`, lakukan release secara sengaja dari working tree yang bersih:

```bash
npm version patch
# atau: npm version minor
# atau: npm version major

git push origin main --follow-tags
```

`npm version` akan memperbarui `package.json`, membuat commit release, dan membuat tag Git yang sesuai. Tag tersebut akan menjalankan workflow GitHub Actions.

Panduan versi:

```text
0.1.0 → 0.1.1   Perbaikan bug atau koreksi kompatibel
0.1.0 → 0.2.0   Fitur baru yang kompatibel
0.1.0 → 1.0.0   Perubahan breaking atau API publik stabil
```

Merge pull request saja tidak akan publish ke npm. Publish dipicu oleh tag versi.

## 10. Periksa hasil release

Periksa workflow GitHub:

```bash
gh run list --workflow publish.yml
gh run view RUN_ID
```

Periksa npm:

```bash
npm view pi-commit-split version dist-tags repository
```

Uji instalasi dari lingkungan bersih:

```bash
pi install npm:pi-commit-split
```

## Troubleshooting

### npm mengembalikan `E401`

Login ulang:

```bash
npm login --auth-type=web
npm whoami
```

### npm mengembalikan `EOTP`

Buka URL autentikasi browser yang ditampilkan npm, selesaikan autentikasi, lalu jalankan kembali command publish.

### GitHub menolak push workflow

Token GitHub memerlukan scope `workflow`. Refresh token dengan:

```bash
gh auth refresh -h github.com -s workflow
gh auth setup-git
```

Lalu push kembali.

### Package belum muncul di Pi Package Gallery

Gallery mungkin melakukan indexing package npm secara berkala. Pastikan package bersifat publik dan memiliki:

```json
"keywords": ["pi-package"]
```

Package tetap dapat diinstal langsung saat proses indexing belum selesai:

```bash
pi install npm:pi-commit-split
```
