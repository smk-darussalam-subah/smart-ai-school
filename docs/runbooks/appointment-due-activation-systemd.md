# Appointment Due Activation Systemd Timer

Tanggal: 2026-07-27

Diperbarui: 2026-09-02

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
- `infrastructure/systemd/diis-appointment-automation.sudoers`
- `infrastructure/systemd/diis-appointment-automation.sha256`

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
- Operasi systemd oleh `appuser` selalu memakai `sudo -n` dan absolute path
  `/usr/bin/systemctl` agar gagal segera tanpa prompt terminal atau password.
- Policy `sudoers` hanya mengizinkan tiga command exact: start service, enable timer, dan
  disable timer. Policy tidak mengizinkan wildcard, arbitrary unit, shell, editor, restart,
  `daemon-reload`, atau passwordless sudo umum.
- Pemasangan policy dan artefak root-owned adalah bootstrap root terkontrol satu kali. Hak itu
  tidak diberikan kepada `appuser`.
- Dilarang memakai helper container host-namespace, `nsenter`, atau Docker socket sebagai jalur
  normal untuk rehearsal, aktivasi, deaktivasi, maupun rollback.

Policy ini membatasi jalur operasional `sudo`, bukan seluruh privilege host. Selama `appuser`
menjadi anggota group Docker, akun tersebut secara teknis tetap host-root-equivalent melalui Docker.
Larangan helper host-namespace adalah kontrol governance yang diaudit, bukan sandbox teknis. Setiap
pelanggaran harus diperlakukan sebagai security incident. Pengurangan privilege Docker adalah
hardening terpisah karena deployment dan script aktivasi saat ini masih bergantung pada Docker.

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

## Gate Source dan Runtime

Timer memakai timezone eksplisit `Asia/Jakarta`. Cek timezone host sebagai konteks log, tetapi jangan mengandalkan timezone host untuk jadwal:

```bash
timedatectl
```

Approval bootstrap harus menyebut tiga nilai tanpa default:

- `EXPECTED_SOURCE_SHA`: exact production commit hasil review;
- `EXPECTED_SOURCE_TREE`: exact Git tree hasil review;
- `EXPECTED_MANIFEST_SHA256`: SHA-256 file manifest versioned.

Sebelum bootstrap, cocokkan source dengan ketiga nilai tersebut, pastikan checkout bersih, dan
pastikan timer tetap `disabled/inactive`. Hentikan bila salah satu nilai tidak tersedia atau
absolute path target berbeda:

```bash
test "$(command -v systemctl)" = /usr/bin/systemctl
test "$(command -v sudo)" = /usr/bin/sudo
test "$(command -v visudo)" = /usr/sbin/visudo
/usr/bin/systemctl is-enabled diis-appointment-due-activation.timer 2>&1 | grep -E 'disabled|not-found'
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.timer)" = inactive
```

Jangan melanjutkan dengan menebak path atau memakai symlink lain. Perubahan path memerlukan
source review baru karena absolute path merupakan bagian dari allowlist.

## Bootstrap Root Terkontrol dan Digest-Pinned

Bagian ini dijalankan dalam console root yang disetujui, bukan melalui `appuser` dan bukan melalui
helper container host-namespace. Nilai `EXPECTED_*` harus berasal dari approval produksi, bukan
dihitung ulang oleh operator dari checkout live. Root menyalin artifact ke direktori temporary
root-owned, memvalidasi snapshot tersebut, lalu tidak membaca checkout `appuser` lagi. Nama target
policy tidak memakai titik karena sudo mengabaikan nama tertentu di `/etc/sudoers.d`.

```bash
set -eu
test "$(id -u)" -eq 0

: "${EXPECTED_SOURCE_SHA:?required from production approval}"
: "${EXPECTED_SOURCE_TREE:?required from production approval}"
: "${EXPECTED_MANIFEST_SHA256:?required from production approval}"

SOURCE_DIR=/home/appuser/smart-ai-school
MANIFEST_SOURCE="$SOURCE_DIR/infrastructure/systemd/diis-appointment-automation.sha256"
OPERATIONS_SOURCE="$SOURCE_DIR/infrastructure/systemd/diis-appointment-operations.sh"
POLICY_TARGET=/etc/sudoers.d/diis-appointment-automation
POLICY_BACKUP=/root/diis-appointment-automation.sudoers.preinstall
SCRIPT_TARGET=/usr/local/bin/diis-appointment-due-activation.sh
RUNBOOK_TARGET=/usr/local/share/doc/diis/appointment-due-activation-systemd.md
OPERATIONS_TARGET=/usr/local/lib/diis/diis-appointment-operations.sh
SERVICE_TARGET=/etc/systemd/system/diis-appointment-due-activation.service
TIMER_TARGET=/etc/systemd/system/diis-appointment-due-activation.timer

test "$(command -v systemctl)" = /usr/bin/systemctl
test "$(command -v visudo)" = /usr/sbin/visudo
test "$(/usr/bin/git -C "$SOURCE_DIR" rev-parse HEAD)" = "$EXPECTED_SOURCE_SHA"
test "$(/usr/bin/git -C "$SOURCE_DIR" rev-parse 'HEAD^{tree}')" = "$EXPECTED_SOURCE_TREE"
test -z "$(/usr/bin/git -C "$SOURCE_DIR" status --porcelain=v1)"
printf '%s  %s\n' "$EXPECTED_MANIFEST_SHA256" "$MANIFEST_SOURCE" | /usr/bin/sha256sum -c -

REVIEWED_DIR=$(/usr/bin/mktemp -d /root/diis-appointment-automation.XXXXXX)
case "$REVIEWED_DIR" in
  /root/diis-appointment-automation.*) ;;
  *) echo 'ERROR: unsafe reviewed directory' >&2; exit 1 ;;
esac
/usr/bin/chown root:root "$REVIEWED_DIR"
/usr/bin/chmod 0700 "$REVIEWED_DIR"

ROLLBACK_DIR=$(/usr/bin/mktemp -d /root/diis-appointment-rollback.XXXXXX)
case "$ROLLBACK_DIR" in
  /root/diis-appointment-rollback.*) ;;
  *) echo 'ERROR: unsafe rollback directory' >&2; exit 1 ;;
esac
/usr/bin/chown root:root "$ROLLBACK_DIR"
/usr/bin/chmod 0700 "$ROLLBACK_DIR"

cleanup_snapshot() {
  case "$REVIEWED_DIR" in
    /root/diis-appointment-automation.*) /usr/bin/rm -rf -- "$REVIEWED_DIR" ;;
    *) echo 'ERROR: refusing unsafe snapshot cleanup' >&2; return 1 ;;
  esac
  case "$ROLLBACK_DIR" in
    /root/diis-appointment-rollback.*) /usr/bin/rm -rf -- "$ROLLBACK_DIR" ;;
    *) echo 'ERROR: refusing unsafe rollback cleanup' >&2; return 1 ;;
  esac
}
trap cleanup_snapshot EXIT

/usr/bin/install -o root -g root -m 0400 "$MANIFEST_SOURCE" "$REVIEWED_DIR/manifest.sha256"
/usr/bin/install -o root -g root -m 0400 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-automation.sudoers" \
  "$REVIEWED_DIR/diis-appointment-automation.sudoers"
/usr/bin/install -o root -g root -m 0500 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.sh" \
  "$REVIEWED_DIR/diis-appointment-due-activation.sh"
/usr/bin/install -o root -g root -m 0500 \
  "$OPERATIONS_SOURCE" "$REVIEWED_DIR/diis-appointment-operations.sh"
/usr/bin/install -o root -g root -m 0400 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.service" \
  "$REVIEWED_DIR/diis-appointment-due-activation.service"
/usr/bin/install -o root -g root -m 0400 \
  "$SOURCE_DIR/infrastructure/systemd/diis-appointment-due-activation.timer" \
  "$REVIEWED_DIR/diis-appointment-due-activation.timer"
/usr/bin/install -o root -g root -m 0400 \
  "$SOURCE_DIR/docs/runbooks/appointment-due-activation-systemd.md" \
  "$REVIEWED_DIR/appointment-due-activation-systemd.md"

printf '%s  %s\n' "$EXPECTED_MANIFEST_SHA256" "$REVIEWED_DIR/manifest.sha256" \
  | /usr/bin/sha256sum -c -
(
  cd "$REVIEWED_DIR"
  /usr/bin/sha256sum -c manifest.sha256
)
/usr/sbin/visudo -cf "$REVIEWED_DIR/diis-appointment-automation.sudoers"
/usr/bin/env bash -n "$REVIEWED_DIR/diis-appointment-due-activation.sh"
/usr/bin/env bash -n "$REVIEWED_DIR/diis-appointment-operations.sh"
/usr/bin/systemd-analyze verify \
  "$REVIEWED_DIR/diis-appointment-due-activation.service" \
  "$REVIEWED_DIR/diis-appointment-due-activation.timer"

snapshot_target() {
  label=$1
  target=$2
  test ! -L "$target"
  if test -e "$target"; then
    test -f "$target"
    /usr/bin/cp -a -- "$target" "$ROLLBACK_DIR/$label.baseline"
    /usr/bin/touch "$ROLLBACK_DIR/$label.present"
  else
    /usr/bin/touch "$ROLLBACK_DIR/$label.absent"
  fi
}

POLICY_NEW="$POLICY_TARGET.new.$$"
SCRIPT_NEW="$SCRIPT_TARGET.new.$$"
RUNBOOK_NEW="$RUNBOOK_TARGET.new.$$"
OPERATIONS_NEW="$OPERATIONS_TARGET.new.$$"
SERVICE_NEW="$SERVICE_TARGET.new.$$"
TIMER_NEW="$TIMER_TARGET.new.$$"

snapshot_target policy "$POLICY_TARGET"
snapshot_target script "$SCRIPT_TARGET"
snapshot_target runbook "$RUNBOOK_TARGET"
snapshot_target operations "$OPERATIONS_TARGET"
snapshot_target service "$SERVICE_TARGET"
snapshot_target timer "$TIMER_TARGET"

if test -e "$ROLLBACK_DIR/policy.present"; then
  /usr/bin/install -o root -g root -m 0440 \
    "$ROLLBACK_DIR/policy.baseline" "$POLICY_BACKUP"
else
  /usr/bin/rm -f "$POLICY_BACKUP"
fi

DIIS_ROLLBACK_DIR=$ROLLBACK_DIR
DIIS_POLICY_TARGET=$POLICY_TARGET
DIIS_SCRIPT_TARGET=$SCRIPT_TARGET
DIIS_RUNBOOK_TARGET=$RUNBOOK_TARGET
DIIS_OPERATIONS_TARGET=$OPERATIONS_TARGET
DIIS_SERVICE_TARGET=$SERVICE_TARGET
DIIS_TIMER_TARGET=$TIMER_TARGET
DIIS_POLICY_NEW=$POLICY_NEW
DIIS_SCRIPT_NEW=$SCRIPT_NEW
DIIS_RUNBOOK_NEW=$RUNBOOK_NEW
DIIS_OPERATIONS_NEW=$OPERATIONS_NEW
DIIS_SERVICE_NEW=$SERVICE_NEW
DIIS_TIMER_NEW=$TIMER_NEW
DIIS_SYSTEMCTL_PATH=/usr/bin/systemctl
DIIS_VISUDO_PATH=/usr/sbin/visudo

# shellcheck source=/dev/null
. "$REVIEWED_DIR/diis-appointment-operations.sh"
diis_cleanup_installation() {
  cleanup_snapshot
}

trap - EXIT
diis_arm_install_traps
/usr/bin/install -o root -g root -m 0440 \
  "$REVIEWED_DIR/diis-appointment-automation.sudoers" "$POLICY_NEW"
/usr/bin/install -o root -g root -m 0755 \
  "$REVIEWED_DIR/diis-appointment-due-activation.sh" "$SCRIPT_NEW"
/usr/bin/install -d -o root -g root -m 0755 /usr/local/share/doc/diis
/usr/bin/install -d -o root -g root -m 0755 /usr/local/lib/diis
/usr/bin/install -o root -g root -m 0644 \
  "$REVIEWED_DIR/appointment-due-activation-systemd.md" "$RUNBOOK_NEW"
/usr/bin/install -o root -g root -m 0644 \
  "$REVIEWED_DIR/diis-appointment-operations.sh" "$OPERATIONS_NEW"
/usr/bin/install -o root -g root -m 0644 \
  "$REVIEWED_DIR/diis-appointment-due-activation.service" "$SERVICE_NEW"
/usr/bin/install -o root -g root -m 0644 \
  "$REVIEWED_DIR/diis-appointment-due-activation.timer" "$TIMER_NEW"

/usr/sbin/visudo -cf "$POLICY_NEW"
/usr/bin/env bash -n "$SCRIPT_NEW"
/usr/bin/env bash -n "$OPERATIONS_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-automation.sudoers" "$POLICY_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.sh" "$SCRIPT_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/appointment-due-activation-systemd.md" "$RUNBOOK_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-operations.sh" "$OPERATIONS_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.service" "$SERVICE_NEW"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.timer" "$TIMER_NEW"

/usr/bin/mv -f -- "$POLICY_NEW" "$POLICY_TARGET"
/usr/bin/mv -f -- "$SCRIPT_NEW" "$SCRIPT_TARGET"
/usr/bin/mv -f -- "$RUNBOOK_NEW" "$RUNBOOK_TARGET"
/usr/bin/mv -f -- "$OPERATIONS_NEW" "$OPERATIONS_TARGET"
/usr/bin/mv -f -- "$SERVICE_NEW" "$SERVICE_TARGET"
/usr/bin/mv -f -- "$TIMER_NEW" "$TIMER_TARGET"
/usr/sbin/visudo -cf /etc/sudoers
/usr/bin/systemd-analyze verify \
  "$SERVICE_TARGET" "$TIMER_TARGET"
/usr/bin/systemctl daemon-reload
/usr/bin/systemctl is-enabled diis-appointment-due-activation.timer | /usr/bin/grep -Fx disabled
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.timer)" = inactive

/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-automation.sudoers" "$POLICY_TARGET"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.sh" "$SCRIPT_TARGET"
/usr/bin/cmp --silent "$REVIEWED_DIR/appointment-due-activation-systemd.md" "$RUNBOOK_TARGET"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-operations.sh" "$OPERATIONS_TARGET"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.service" "$SERVICE_TARGET"
/usr/bin/cmp --silent "$REVIEWED_DIR/diis-appointment-due-activation.timer" "$TIMER_TARGET"
/usr/bin/test "$(/usr/bin/stat -c '%U:%G %a' "$POLICY_TARGET")" = 'root:root 440'
/usr/bin/sha256sum "$POLICY_TARGET" "$SCRIPT_TARGET" "$RUNBOOK_TARGET" \
  "$OPERATIONS_TARGET" "$SERVICE_TARGET" "$TIMER_TARGET"
/usr/bin/stat -c '%U:%G %a %n' "$POLICY_TARGET" "$SCRIPT_TARGET" "$RUNBOOK_TARGET" \
  "$OPERATIONS_TARGET" "$SERVICE_TARGET" "$TIMER_TARGET"
DIIS_INSTALL_COMMITTED=true
```

Expected:

- approval SHA, tree, dan manifest hash cocok exact;
- seluruh snapshot artifact lulus manifest, syntax, dan unit verification;
- baseline keenam target tersimpan dengan marker `present/absent` sebelum target diubah;
- seluruh temporary target byte-identik dan tervalidasi sebelum rename;
- runtime artifact byte-identik dengan snapshot root-owned;
- owner/group policy `root:root` dan mode `440` (setara `0440`);
- command failure, explicit exit, dan `HUP/INT/TERM` memulihkan bytes/metadata baseline atau
  menghapus target yang sebelumnya tidak ada,
  menjalankan `daemon-reload`, dan membuktikan ulang state timer;
- snapshot temporary dibersihkan oleh trap;
- timer tetap `disabled/inactive`.

Bootstrap hanya memasang policy dan artifact. Timer wajib tetap `disabled/inactive` sampai gate
aktivasi produksi terpisah disetujui. Jangan memasang file langsung dari checkout setelah snapshot
lulus.

## Preflight Appuser dan Negative Controls

Jalankan sebagai `appuser` setelah bootstrap policy, setelah deploy, dan saat troubleshooting:

```bash
whoami
id -nG | grep -qw docker
docker ps --format '{{.Names}}' | head -n 1 >/dev/null
docker inspect --format '{{.State.Running}}' smk-api
docker exec smk-api node -e 'console.log(Boolean(process.env.APPOINTMENT_AUTOMATION_TOKEN && process.env.APPOINTMENT_AUTOMATION_TOKEN.length >= 32))'
test "$(command -v systemctl)" = /usr/bin/systemctl
test "$(command -v sudo)" = /usr/bin/sudo
/usr/bin/sudo -n -l >/dev/null
```

Expected:

- user aktif adalah `appuser`;
- `appuser` termasuk group `docker`;
- `docker ps` dapat dijalankan tanpa `sudo`;
- `smk-api` sedang berjalan;
- token automation tersedia di environment API dan panjangnya minimal 32 karakter.
- daftar privilege dapat dibaca noninteraktif tanpa prompt password.

Buktikan ketiga command exact diizinkan tanpa menjalankannya:

```bash
/usr/bin/sudo -n -l /usr/bin/systemctl start diis-appointment-due-activation.service >/dev/null
/usr/bin/sudo -n -l /usr/bin/systemctl enable --now diis-appointment-due-activation.timer >/dev/null
/usr/bin/sudo -n -l /usr/bin/systemctl disable --now diis-appointment-due-activation.timer >/dev/null
```

Negative control wajib ditolak. Command berikut hanya memeriksa policy dengan `sudo -n -l` dan
tidak menjalankan operasi systemd atau shell:

```bash
if /usr/bin/sudo -n -l /usr/bin/systemctl restart diis-appointment-due-activation.service >/dev/null 2>&1; then
  echo 'ERROR: restart unexpectedly allowed' >&2
  exit 1
fi
if /usr/bin/sudo -n -l /usr/bin/systemctl daemon-reload >/dev/null 2>&1; then
  echo 'ERROR: daemon-reload unexpectedly allowed' >&2
  exit 1
fi
if /usr/bin/sudo -n -l /usr/bin/systemctl start ssh.service >/dev/null 2>&1; then
  echo 'ERROR: arbitrary unit unexpectedly allowed' >&2
  exit 1
fi
if /usr/bin/sudo -n -l /usr/bin/vim /etc/sudoers >/dev/null 2>&1; then
  echo 'ERROR: editor unexpectedly allowed' >&2
  exit 1
fi
if /usr/bin/sudo -n -l /bin/sh -c true >/dev/null 2>&1; then
  echo 'ERROR: shell unexpectedly allowed' >&2
  exit 1
fi
```

Jika salah satu negative control diizinkan, hentikan. Jangan mencoba memperbaiki dengan policy
tambahan, wildcard, helper host-namespace, atau command manual.

## Aktivasi Produksi Terpisah

Aktivasi hanya dilakukan setelah source review, instalasi policy, manual rehearsal, health, journal,
dan rekonsiliasi database lulus pada gate produksi yang disetujui. Karena timer memakai
`Persistent=true`, `enable --now` dapat langsung menjalankan catch-up bila jadwal `00:15 WIB`
terlewat selama timer disabled. Immediate run tersebut adalah bagian dari activation gate, bukan
run di luar evidence.

Sebelum aktivasi, rekam evidence PII-safe berikut:

- school date dari `TZ=Asia/Jakarta date +%F`;
- state timer, `LastTriggerUSec`, `NextElapseUSecRealtime`, dan service start timestamp;
- journal cursor sebelum aktivasi;
- baseline aggregate database dari query read-only yang telah direview, minimal active year,
  due `APPROVED`, expired prepared, expired `ACTIVE/SUSPENDED`, dan active count;
- hash evidence baseline, tanpa row, UUID, nama, email, atau payload Appointment.

Jangan lanjut bila baseline belum tersedia, service sedang aktif, health tidak sehat, atau aktivasi
terlalu dekat dengan jadwal normal. Jalankan activation dengan fail-closed trap dan tunggu service
settle secara bounded. Satu pembacaan `inactive` tidak cukup: quiet window wajib membuktikan lima
sampel stabil tanpa job timer/service sebelum journal dibekukan:

```bash
set -eu
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.service)" = inactive
OPERATIONS_LIB=/usr/local/lib/diis/diis-appointment-operations.sh
test "$(/usr/bin/stat -c '%U:%G %a' "$OPERATIONS_LIB")" = 'root:root 644'
# shellcheck source=/dev/null
. "$OPERATIONS_LIB"

SCHOOL_DATE_BEFORE=$(TZ=Asia/Jakarta /usr/bin/date +%F)
LAST_TRIGGER_BEFORE=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.timer -p LastTriggerUSec --value)
NEXT_TRIGGER_BEFORE=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.timer -p NextElapseUSecRealtime --value)
SERVICE_START_BEFORE=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.service -p ExecMainStartTimestampMonotonic --value)
JOURNAL_CURSOR=$(/usr/bin/journalctl \
  -u diis-appointment-due-activation.service -n 0 --show-cursor --no-pager \
  | /usr/bin/sed -n 's/^-- cursor: //p')
test -n "$JOURNAL_CURSOR"

EVIDENCE_DIR=$(/usr/bin/mktemp -d)
/usr/bin/chmod 0700 "$EVIDENCE_DIR"
ACTIVATION_GATE_PASSED=false
cleanup_activation_evidence() {
  case "$EVIDENCE_DIR" in
    /tmp/*) /usr/bin/rm -rf -- "$EVIDENCE_DIR" ;;
    *) echo 'ERROR: refusing unsafe evidence cleanup' >&2; return 1 ;;
  esac
}
fail_closed_activation() {
  trap - ERR
  /usr/bin/sudo -n /usr/bin/systemctl disable --now \
    diis-appointment-due-activation.timer
}
activation_exit() {
  exit_status=$?
  trap - EXIT ERR
  if test "$ACTIVATION_GATE_PASSED" != true; then
    /usr/bin/sudo -n /usr/bin/systemctl disable --now \
      diis-appointment-due-activation.timer
  fi
  cleanup_activation_evidence
  return "$exit_status"
}
trap activation_exit EXIT
trap fail_closed_activation ERR

/usr/bin/sudo -n /usr/bin/systemctl enable --now diis-appointment-due-activation.timer
DIIS_SYSTEMCTL_PATH=/usr/bin/systemctl
DIIS_SERVICE_UNIT=diis-appointment-due-activation.service
DIIS_TIMER_UNIT=diis-appointment-due-activation.timer
DIIS_SERVICE_START_BEFORE=$SERVICE_START_BEFORE
DIIS_LAST_TRIGGER_BEFORE=$LAST_TRIGGER_BEFORE
DIIS_QUIET_SAMPLES_REQUIRED=5
DIIS_MAX_OBSERVATION_ATTEMPTS=60
DIIS_OBSERVATION_SLEEP_SECONDS=2
diis_wait_for_quiet_window
SERVICE_START_FINAL=$DIIS_SERVICE_START_FINAL
LAST_TRIGGER_FINAL=$DIIS_LAST_TRIGGER_FINAL

/usr/bin/journalctl -u diis-appointment-due-activation.service \
  --after-cursor "$JOURNAL_CURSOR" -o cat --no-pager \
  >"$EVIDENCE_DIR/service.log"

SERVICE_START_AFTER=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.service -p ExecMainStartTimestampMonotonic --value)
LAST_TRIGGER_AFTER=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.timer -p LastTriggerUSec --value)
if diis_related_jobs_present; then
  echo 'ERROR: related systemd job appeared after the quiet window' >&2
  exit 1
else
  jobs_status=$?
  test "$jobs_status" -eq 1
fi
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.service)" = inactive
test "$SERVICE_START_AFTER" = "$SERVICE_START_FINAL"
test "$LAST_TRIGGER_AFTER" = "$LAST_TRIGGER_FINAL"

RESULT_COUNT=$(/usr/bin/grep -Ec \
  '^appointment activation result: \{"ok":true,"statusCode":[0-9]+,"endedCount":[0-9]+,"cancelledCount":[0-9]+,"activatedCount":[0-9]+,"affectedUserCount":[0-9]+\}$' \
  "$EVIDENCE_DIR/service.log" || true)

if test "$SERVICE_START_FINAL" != "$SERVICE_START_BEFORE" \
  || test "$LAST_TRIGGER_FINAL" != "$LAST_TRIGGER_BEFORE"; then
  test "$RESULT_COUNT" -eq 1
  echo 'Immediate persistent catch-up occurred; reconcile this run before continuing.'
else
  test "$SERVICE_START_FINAL" = "$SERVICE_START_BEFORE"
  test "$LAST_TRIGGER_FINAL" = "$LAST_TRIGGER_BEFORE"
  test "$RESULT_COUNT" -eq 0
  echo 'No immediate catch-up occurred; verify the next scheduled trigger.'
fi

/usr/bin/systemctl is-enabled diis-appointment-due-activation.timer | /usr/bin/grep -Fx enabled
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.timer)" = active
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.service)" = inactive
SCHOOL_DATE_AFTER=$(TZ=Asia/Jakarta /usr/bin/date +%F)
NEXT_TRIGGER_AFTER=$(/usr/bin/systemctl show \
  diis-appointment-due-activation.timer -p NextElapseUSecRealtime --value)
test "$SCHOOL_DATE_AFTER" = "$SCHOOL_DATE_BEFORE"
test -n "$NEXT_TRIGGER_AFTER"
test "$NEXT_TRIGGER_AFTER" != n/a
NEXT_TRIGGER_EPOCH=$(/usr/bin/date --date="$NEXT_TRIGGER_AFTER" +%s)
test "$NEXT_TRIGGER_EPOCH" -gt "$(/usr/bin/date +%s)"
test "$(TZ=Asia/Jakarta /usr/bin/date --date="$NEXT_TRIGGER_AFTER" +%H:%M)" = 00:15
printf 'last_trigger_before=%s\nlast_trigger_after=%s\nnext_trigger_before=%s\nnext_trigger_after=%s\n' \
  "$LAST_TRIGGER_BEFORE" "$LAST_TRIGGER_AFTER" "$NEXT_TRIGGER_BEFORE" "$NEXT_TRIGGER_AFTER"
/usr/bin/systemctl list-timers diis-appointment-due-activation.timer
```

Setelah snippet, gate belum selesai. Bila immediate catch-up terjadi, lakukan seluruh langkah ini
sebelum melepaskan fail-closed control:

1. ekstrak hanya satu JSON result dan validasi ulang exact four-safe-count;
2. ambil aggregate database sesudah run dan rekonsiliasi setiap count terhadap delta;
3. buktikan health API, web, PostgreSQL, dan migration tetap sehat;
4. scan journal untuk token, PII, Keycloak ID, UUID internal, raw payload, failure, dan retry liar;
5. buktikan service kembali `inactive` dan tidak ada duplicate transition.

Bila immediate catch-up tidak terjadi, buktikan `NextElapseUSecRealtime` berada pada jadwal
`00:15 Asia/Jakarta` yang benar dan lebih besar dari waktu sekarang. Dalam kedua cabang, school date
tidak boleh berubah secara ambigu selama gate. Baru setelah seluruh evidence lulus, lepaskan trap
dengan:

```bash
ACTIVATION_GATE_PASSED=true
trap - ERR
```

Trap `EXIT` tetap membersihkan evidence lokal. Jalankan aktivasi dan rekonsiliasi dalam shell yang
sama; bila shell keluar sebelum `ACTIVATION_GATE_PASSED=true`, timer otomatis dinonaktifkan.

Expected final:

- timer `enabled`;
- service `inactive`;
- immediate catch-up direkonsiliasi penuh atau next trigger dibuktikan benar;
- health dan journal aman.

Jika state, count, reconciliation, health, journal, atau next trigger gagal/ambigu, trap menjalankan
exact command `sudo -n /usr/bin/systemctl disable --now` dan proses berhenti. Tidak boleh mengulang
activation tanpa investigasi, re-review, dan approval baru.

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
/usr/bin/systemctl cat diis-appointment-due-activation.service
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
/usr/bin/sudo -n /usr/bin/systemctl start diis-appointment-due-activation.service
/usr/bin/systemctl status diis-appointment-due-activation.service --no-pager
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
/usr/bin/systemctl list-timers diis-appointment-due-activation.timer
```

Log tidak boleh berisi token, Keycloak ID, email, nomor telepon, atau payload appointment mentah.

## Token Rotation

1. Generate token baru minimal 32 byte random.
2. Update `APPOINTMENT_AUTOMATION_TOKEN` pada environment API target.
3. Restart container API target.
4. Jalankan `/usr/bin/sudo -n /usr/bin/systemctl start diis-appointment-due-activation.service`.
5. Pastikan log hanya menampilkan safe counts dan status 2xx.
6. Pastikan token lama tidak diterima dengan smoke endpoint terpisah yang memakai header lama.

## Disable / Rollback

Emergency disable scheduler tanpa mengubah domain endpoint:

```bash
/usr/bin/sudo -n /usr/bin/systemctl disable --now diis-appointment-due-activation.timer
/usr/bin/systemctl list-timers diis-appointment-due-activation.timer
```

Fail-closed endpoint:

1. Kosongkan atau hapus `APPOINTMENT_AUTOMATION_TOKEN` dari environment API.
2. Restart API.
3. Endpoint `POST /api/v1/appointments/activate-due` harus menolak request machine dengan 403.

Rollback source dan policy hanya dilakukan dari console root terkontrol. `appuser` tidak diberi
hak menghapus file, menjalankan `daemon-reload`, atau mengedit sudoers. Bila policy lama pernah
ada, pulihkan backup; bila tidak, hapus policy DIIS. Validasi seluruh sudoers sebelum keluar:

```bash
set -eu
test "$(id -u)" -eq 0

POLICY_TARGET=/etc/sudoers.d/diis-appointment-automation
POLICY_BACKUP=/root/diis-appointment-automation.sudoers.preinstall

/usr/bin/systemctl disable --now diis-appointment-due-activation.timer
/usr/bin/rm -f /etc/systemd/system/diis-appointment-due-activation.service
/usr/bin/rm -f /etc/systemd/system/diis-appointment-due-activation.timer
/usr/bin/rm -f /usr/local/bin/diis-appointment-due-activation.sh
/usr/bin/rm -f /usr/local/share/doc/diis/appointment-due-activation-systemd.md

if test -e "$POLICY_BACKUP"; then
  /usr/bin/install -o root -g root -m 0440 "$POLICY_BACKUP" "$POLICY_TARGET"
else
  /usr/bin/rm -f "$POLICY_TARGET"
fi

/usr/sbin/visudo -cf /etc/sudoers
/usr/bin/systemctl daemon-reload
/usr/bin/systemctl is-enabled diis-appointment-due-activation.timer 2>&1 | grep -E 'disabled|not-found'
test "$(/usr/bin/systemctl is-active diis-appointment-due-activation.timer)" = inactive
```

Dilarang memakai helper container host-namespace sebagai pengganti bootstrap, operasi rutin, atau
rollback. Jika console root resmi tidak tersedia, hentikan dan eskalasikan akses; jangan memperluas
policy `sudoers`.

Jangan mengaktifkan kembali workflow n8n appointment; n8n tetap hanya untuk workflow lain yang disetujui.
