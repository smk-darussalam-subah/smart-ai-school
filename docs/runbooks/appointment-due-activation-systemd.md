# Appointment Due Activation Systemd Timer

Tanggal: 2026-07-27

## Tujuan

Appointment yang sudah `APPROVED` dan jatuh tempo pada tahun ajaran aktif harus otomatis berubah menjadi `ACTIVE`. Domain transition tetap dimiliki NestJS melalui endpoint internal:

```text
POST /api/v1/appointments/activate-due
```

n8n tidak menjadi caller endpoint ini. Trigger eksternal resmi adalah VPS `systemd timer`.

## Source Files

- `infrastructure/systemd/diis-appointment-due-activation.sh`
- `infrastructure/systemd/diis-appointment-due-activation.service`
- `infrastructure/systemd/diis-appointment-due-activation.timer`

## Security Contract

- Token tetap hanya berada di environment container API sebagai `APPOINTMENT_AUTOMATION_TOKEN`.
- Unit dan script tidak menyimpan token literal.
- Script membaca token dari environment container API melalui `docker exec`, lalu memanggil API dari dalam container yang sama ke `127.0.0.1:3001`.
- Output log hanya berisi status dan count aman: `endedCount`, `cancelledCount`, `activatedCount`, dan `affectedUserCount`.
- Endpoint publik tetap diblokir oleh nginx.
- HTTP non-2xx membuat service exit nonzero agar `systemd` menandai eksekusi gagal.
- HTTP 2xx dengan body kosong, JSON malformed, field count hilang, field tambahan, atau count non-integer membuat script exit nonzero.
- Script melakukan bounded retry, default 3 percobaan dengan jeda 10 detik.
- Override dibatasi:
  - `DIIS_APPOINTMENT_REQUEST_TIMEOUT_MS`: 1000 sampai 120000.
  - `DIIS_APPOINTMENT_MAX_ATTEMPTS`: 1 sampai 5.
  - `DIIS_APPOINTMENT_RETRY_DELAY_SECONDS`: 0 sampai 300.

Respons sukses API harus exact allowlist:

```json
{
  "endedCount": 0,
  "cancelledCount": 0,
  "activatedCount": 0,
  "affectedUserCount": 0
}
```

Field tambahan seperti identifier internal harus ditolak, bukan hanya tidak dicetak.

## Install Produksi

Timer memakai timezone eksplisit `Asia/Jakarta`. Cek timezone host sebagai konteks log, tetapi jangan mengandalkan timezone host untuk jadwal:

```bash
timedatectl
```

## Preflight Appuser

Jalankan sebagai `appuser` sebelum install, setelah deploy, dan saat troubleshooting:

```bash
whoami
id -nG | grep -qw docker
docker ps --format '{{.Names}}' | head -n 1 >/dev/null
docker inspect --format '{{.State.Running}}' smk-api
docker exec smk-api node -e 'console.log(Boolean(process.env.APPOINTMENT_AUTOMATION_TOKEN && process.env.APPOINTMENT_AUTOMATION_TOKEN.length >= 32))'
```

Expected:

- user aktif adalah `appuser`;
- `appuser` termasuk group `docker`;
- `docker ps` dapat dijalankan tanpa `sudo`;
- `smk-api` sedang berjalan;
- token automation tersedia di environment API dan panjangnya minimal 32 karakter.

Tentukan path source sesuai environment:

```bash
SOURCE_DIR=/home/appuser/smart-ai-school
```

Copy script ke path runtime:

```bash
sudo install -o root -g root -m 0755 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.sh" \
  /usr/local/bin/diis-appointment-due-activation.sh
```

Copy unit, timer, dan runbook:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/share/doc/diis
sudo install -o root -g root -m 0644 \
  "$SOURCE_DIR/docs/runbooks/appointment-due-activation-systemd.md" \
  /usr/local/share/doc/diis/appointment-due-activation-systemd.md

sudo install -o root -g root -m 0644 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.service" \
  /etc/systemd/system/diis-appointment-due-activation.service

sudo install -o root -g root -m 0644 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.timer" \
  /etc/systemd/system/diis-appointment-due-activation.timer
```

Reload dan enable timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now diis-appointment-due-activation.timer
systemctl list-timers diis-appointment-due-activation.timer
```

Expected:

- timer `enabled`;
- next run sekitar 00:15 Asia/Jakarta;
- `Persistent=true` aktif sehingga jadwal yang terlewat saat reboot dijalankan setelah boot.

## Staging Manual Test Only

Staging dan produksi berada pada VPS yang sama. Jangan memakai drop-in pada unit produksi untuk mengarahkannya ke `smk-staging-api`, karena itu dapat mengalihkan timer produksi. Timer hanya boleh `enabled` untuk produksi.

Untuk staging, jalankan script manual satu kali dari source staging tanpa mengubah unit:

```bash
SOURCE_DIR=/opt/diis-staging/smart-ai-school
DIIS_API_CONTAINER=smk-staging-api \
DIIS_APPOINTMENT_MAX_ATTEMPTS=2 \
DIIS_APPOINTMENT_RETRY_DELAY_SECONDS=5 \
  bash "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.sh"
```

Expected output tetap hanya safe counts. Setelah staging manual test, pastikan tidak ada drop-in:

```bash
systemctl cat diis-appointment-due-activation.service
test ! -d /etc/systemd/system/diis-appointment-due-activation.service.d
```

## Manual Test

Validasi source unit:

```bash
bash -n "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.sh"
systemd-analyze verify \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.service" \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.timer"
systemd-analyze calendar '*-*-* 00:15:00 Asia/Jakarta'
```

Uji guard endpoint dari dalam API container:

```bash
docker exec smk-staging-api node -e 'const http=require("node:http");const req=http.request({host:"127.0.0.1",port:3001,path:"/api/v1/appointments/activate-due",method:"POST"},res=>{console.log(res.statusCode);process.exit(res.statusCode===403?0:1);});req.on("error",e=>{console.error(e.message);process.exit(1);});req.end();'
```

Jalankan service manual:

```bash
sudo systemctl start diis-appointment-due-activation.service
sudo systemctl status diis-appointment-due-activation.service --no-pager
journalctl -u diis-appointment-due-activation.service -n 50 --no-pager
```

Expected log:

```json
{"ok":true,"statusCode":201,"endedCount":0,"cancelledCount":0,"activatedCount":0,"affectedUserCount":0}
```

Status code dapat mengikuti kontrak NestJS untuk `POST`, tetapi harus 2xx. Jalankan start kedua untuk membuktikan retry idempotent; count tidak boleh menggandakan activation yang sama.

Uji kontrak response pada disposable/mock endpoint sebelum install produksi:

- `200`/`201` dengan body kosong harus exit nonzero.
- `200`/`201` dengan JSON malformed harus exit nonzero.
- `200`/`201` tanpa salah satu dari empat count harus exit nonzero.
- `200`/`201` dengan count string/null/negatif/desimal harus exit nonzero.
- `200`/`201` dengan field tambahan seperti `affectedKeycloakIds` harus exit nonzero.

## Log Inspection

```bash
journalctl -u diis-appointment-due-activation.service --since "24 hours ago" --no-pager
systemctl list-timers diis-appointment-due-activation.timer
```

Log tidak boleh berisi token, Keycloak ID, email, nomor telepon, atau payload appointment mentah.

## Token Rotation

1. Generate token baru minimal 32 byte random.
2. Update `APPOINTMENT_AUTOMATION_TOKEN` pada environment API target.
3. Restart container API target.
4. Jalankan `sudo systemctl start diis-appointment-due-activation.service`.
5. Pastikan log hanya menampilkan safe counts dan status 2xx.
6. Pastikan token lama tidak diterima dengan smoke endpoint terpisah yang memakai header lama.

## Disable / Rollback

Emergency disable scheduler tanpa mengubah domain endpoint:

```bash
sudo systemctl disable --now diis-appointment-due-activation.timer
systemctl list-timers diis-appointment-due-activation.timer
```

Fail-closed endpoint:

1. Kosongkan atau hapus `APPOINTMENT_AUTOMATION_TOKEN` dari environment API.
2. Restart API.
3. Endpoint `POST /api/v1/appointments/activate-due` harus menolak request machine dengan 403.

Rollback source:

```bash
sudo rm -f /etc/systemd/system/diis-appointment-due-activation.service
sudo rm -f /etc/systemd/system/diis-appointment-due-activation.timer
sudo rm -f /usr/local/bin/diis-appointment-due-activation.sh
sudo rm -f /usr/local/share/doc/diis/appointment-due-activation-systemd.md
sudo systemctl daemon-reload
```

Jangan mengaktifkan kembali workflow n8n appointment; n8n tetap hanya untuk workflow lain yang disetujui.
