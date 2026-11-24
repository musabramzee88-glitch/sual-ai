#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# نقل بياناتك من جهازك إلى الخادم (مرة واحدة بعد install.sh):
#   1) على جهازك:  npm run backup        ← ينشئ مجلد backups (قاعدة البيانات + الكتب والصور)
#   2) ارفع المجلد:  scp -r backups root@عنوان-الخادم:/root/sual-import
#   3) على الخادم:  sudo bash /opt/sual-ai/deploy/import.sh /root/sual-import
# يأخذ نسخة أمان من بيانات الخادم الحالية أولاً، ثم يضع بياناتك مكانها ويطبّق تحديثات قاعدة البيانات.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
APP_DIR=/opt/sual-ai
APP_USER=sual
STAGE=/var/lib/sual/import

die() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "شغّله بصلاحية root:  sudo bash $0 <المجلد>"
SRC="${1:-}"
[ -n "$SRC" ] && [ -d "$SRC/db" ] || die "أعطني مجلد النسخة المرفوع (فيه db/ و storage/). مثال: sudo bash $0 /root/sual-import"
ls "$SRC"/db/*.dump >/dev/null 2>&1 || die "لا توجد ملفات .dump في $SRC/db"

echo "آخر نسخة في المجلد: $(find "$SRC/db" -name '*.dump' | sort | tail -1 | xargs -n1 basename)"
read -rp "سيستبدل هذا كل بيانات الموقع على الخادم ببيانات جهازك. متابعة؟ [y/N]: " ANS
[[ "${ANS:-N}" =~ ^[Yy]$ ]] || die "أُلغي."

# مجلد يصل إليه مستخدم التشغيل (مجلد root مغلق عليه)
mkdir -p "$STAGE"
cp -a "$SRC/." "$STAGE/"
chown -R "$APP_USER:$APP_USER" "$STAGE"

systemctl stop sual
trap 'systemctl start sual' EXIT
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && BACKUP_DIR='$STAGE' node scripts/backup.mjs restore --yes && npx prisma migrate deploy"
echo "✔ تم النقل. الموقع يعود للعمل الآن؛ افتحه وتأكد من الكتب والامتحانات."
echo "  (نسخة أمان من بيانات الخادم قبل النقل محفوظة في $STAGE/db)"
