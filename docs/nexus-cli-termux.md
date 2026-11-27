# RADAR NEXUS CLI — Termux

NEXUS CLI adalah klien terminal untuk RADAR NEXUS. Ia memakai API dan kebijakan yang sama dengan NEXUS Chat di dashboard; bukan backend, reasoning engine, atau memory kedua.

## Instal di Termux

```sh
pkg install nodejs-lts git
cd ~
git clone https://github.com/rohman35819/radar-ai-v2.git
cd radar-ai-v2
chmod +x bin/nexus
ln -sf "$PWD/bin/nexus" "$PREFIX/bin/nexus"
nexus
```

Update:

```sh
cd ~/radar-ai-v2 && git pull --ff-only && nexus
```

## Konfigurasi opsional

```sh
export NEXUS_BASE_URL=http://127.0.0.1:3000
export NEXUS_ADMIN_TOKEN=...        # token admin server RADAR, jangan pernah di-commit
export NEXUS_PARTICIPANTS=gemini,groq,openrouter,openai
```

Tanpa `NEXUS_ADMIN_TOKEN`, NEXUS tetap bisa dipakai untuk menjelajah repository, membaca file, mencari kode, dan mengusulkan perubahan, tetapi percakapan AI ditampilkan jujur sebagai `unavailable`/`not_configured`. Tidak ada provider berbayar yang dipanggil otomatis.

## Perintah

Ketik `/help` di dalam NEXUS. Ringkasnya: `/status`, `/memory`, `/structure`, `/files`, `/read`, `/search`, `/edit`, `/run`, `/sessions`, `/new`, `/resume`, `/clear`, `/exit`. Teks biasa dikirim sebagai pesan ke NEXUS Core melalui endpoint yang sama dengan dashboard.

## Batas keamanan

- Default read-only. `/edit` dan `/run` selalu menampilkan detail dan meminta persetujuan eksplisit.
- Hanya perintah allowlist yang bisa dijalankan: `npm test`, `npm run typecheck`, `python3 -m unittest`, `git status`, `git diff`, `git log -1`.
- Tidak ada arbitrary shell, akses secret, autonomous worker, scheduler, deploy, trading, withdrawal, atau paper ledger.
- Riwayat sesi disimpan lokal di `~/.radar-nexus/sessions.json`, bukan di repository Git.
- Model yang dipakai adalah provider eksternal yang dikonfigurasi server; NEXUS tidak mengklaim memiliki model proprietary sendiri.

NEXUS CLI tidak berjalan di latar belakang ketika terminal ditutup.
