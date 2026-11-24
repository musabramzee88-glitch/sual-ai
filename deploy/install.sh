#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# تنصيب «سُؤال AI» على خادم Ubuntu (22.04 أو 24.04) بأمر واحد:
#   sudo bash install.sh
# يسأل عن: النطاق، بريدك (لشهادة HTTPS)، وهل تُغلق الدخول بكلمة مرور إلى الخادم.
# آمن لإعادة التشغيل: لا يكتب فوق .env ولا قاعدة البيانات إن كانت موجودة.
#
# ماذا يفعل:
#   PostgreSQL (أحدث نسخة) · Node 22 · متصفح Chromium لصنع PDF · الخطوط العربية · nginx + HTTPS مجاني (Let's Encrypt)
#   جدار ناري (SSH و HTTP/HTTPS فقط) · fail2ban ضد تخمين كلمات المرور · تحديثات أمنية تلقائية · ذاكرة swap
#   مستخدم نظام «sual» يشغّل الموقع (لا root) · خدمة systemd تعمل بعد إعادة التشغيل وتسحب التحديثات من GitHub كل دقيقة
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${REPO:-git@github.com:musabramzee88-glitch/sual-ai.git}"
BRANCH="${BRANCH:-claude/laughing-keller-wtmrzs}"
APP_DIR=/opt/sual-ai
APP_USER=sual
DATA_DIR=/var/lib/sual
BACKUP_DIR=/var/backups/sual

say()  { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $*"; }

[ "$(id -u)" -eq 0 ] || die "شغّله بصلاحية root:  sudo bash install.sh"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "هذا السكربت لـ Ubuntu فقط (الحالي: ${PRETTY_NAME:-غير معروف})."

# ── الأسئلة ──
DOMAIN="${DOMAIN:-}"; LE_EMAIL="${LE_EMAIL:-}"
[ -n "$DOMAIN" ] || read -rp "اسم النطاق (مثال: sual-ai.com): " DOMAIN
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "نطاق غير صالح: $DOMAIN"
[ -n "$LE_EMAIL" ] || read -rp "بريدك (تصلك عليه تنبيهات شهادة HTTPS): " LE_EMAIL
[[ "$LE_EMAIL" == *@*.* ]] || die "بريد غير صالح: $LE_EMAIL"

say "تحديث النظام وتثبيت الحزم"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl nginx ufw fail2ban unattended-upgrades \
  certbot python3-certbot-nginx rclone fontconfig fonts-hosny-amiri fonts-noto-core fonts-liberation2 postgresql-common

say "PostgreSQL (أحدث نسخة، لتقرأ نسخك الاحتياطية من أي إصدار)"
if [ ! -f /etc/apt/sources.list.d/pgdg.list ] && [ ! -f /etc/apt/sources.list.d/pgdg.sources ]; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
fi
apt-get install -y postgresql
systemctl enable --now postgresql

say "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

say "ذاكرة إضافية (swap) إن كانت الذاكرة أقل من 6GB"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 6000 ] && ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "مستخدم التشغيل والمجلدات"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /bin/bash "$APP_USER"
mkdir -p "$DATA_DIR/storage" "$BACKUP_DIR" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$BACKUP_DIR" "$APP_DIR"

say "مفتاح الوصول إلى المستودع على GitHub (للقراءة فقط)"
KEY=/home/$APP_USER/.ssh/id_ed25519
if [ ! -f "$KEY" ]; then
  sudo -u "$APP_USER" mkdir -p /home/$APP_USER/.ssh
  sudo -u "$APP_USER" ssh-keygen -t ed25519 -N "" -C "sual-server@$DOMAIN" -f "$KEY" >/dev/null
fi
ssh-keyscan -t ed25519 github.com 2>/dev/null | sudo -u "$APP_USER" tee /home/$APP_USER/.ssh/known_hosts >/dev/null
if [ ! -d "$APP_DIR/.git" ]; then
  echo
  echo "أضف هذا المفتاح في GitHub: المستودع ← Settings ← Deploy keys ← Add deploy key (اترك Allow write access بلا علامة):"
  echo "────────────────────────────────────────"; cat "$KEY.pub"; echo "────────────────────────────────────────"
  until sudo -u "$APP_USER" git ls-remote "$REPO" >/dev/null 2>&1; do
    read -rp "بعد إضافته اضغط Enter (أو Ctrl+C للإلغاء)… " _
  done
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

say "الخطوط العربية لأوراق الامتحان"
install -m 644 "$APP_DIR/deploy/fonts/60-sual-arabic.conf" /etc/fonts/conf.d/60-sual-arabic.conf
fc-cache -f >/dev/null
[ "$(fc-match 'Traditional Arabic:lang=ar' family)" = "Amiri" ] || warn "ربط الخطوط لم ينجح؛ ستعمل الأوراق بخط بديل."

say "قاعدة البيانات"
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='sual'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER ROLE sual WITH LOGIN PASSWORD '$DB_PASS'" >/dev/null
  else
    sudo -u postgres psql -c "CREATE ROLE sual WITH LOGIN PASSWORD '$DB_PASS'" >/dev/null
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='sual'" | grep -q 1 || sudo -u postgres createdb -O sual sual

  say "ملف الإعدادات .env (الأسرار تُولَّد هنا ولا تُطبع)"
  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL="postgresql://sual:${DB_PASS}@127.0.0.1:5432/sual?schema=public"
APP_URL="https://${DOMAIN}"
AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
STORAGE_DIR="${DATA_DIR}/storage"
BACKUP_DIR="${BACKUP_DIR}"
TRUSTED_PROXY_HOPS=1
OCR_WORKERS=1

# ── املأ هذه ثم:  sudo systemctl restart sual ──
# مفتاح Gemini من aistudio.google.com
GEMINI_API_KEY=
# البريد لرموز التحقق: resend أو smtp
EMAIL_PROVIDER=resend
EMAIL_FROM=
RESEND_API_KEY=
# يظهر في صفحات الشروط والخصوصية وتواصل معنا
SUPPORT_EMAIL=
SUPPORT_WHATSAPP=
REFUND_DAYS=0
# تصلك عليه رسالة عند أي عطل
ALERT_EMAIL=${LE_EMAIL}
# نسخة احتياطية خارج الخادم (بعد «rclone config» كمستخدم sual)، مثال: storagebox:sual
OFFSITE_REMOTE=
EOF
  umask 022
  chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
else
  echo "‏.env موجود — لم يُمس."
fi

say "المكتبات ومتصفح PDF"
as_app "npm ci --no-audit --no-fund"
(cd "$APP_DIR" && npx --yes playwright-core install-deps chromium >/dev/null)
as_app "npx playwright-core install chromium"
CHROME=$(find /home/$APP_USER/.cache/ms-playwright -path '*chrome-linux*/chrome' -type f 2>/dev/null | sort | tail -1)
[ -n "$CHROME" ] || die "لم أجد Chromium بعد تثبيته."
if grep -q '^CHROMIUM_PATH=' "$ENV_FILE"; then sed -i "s#^CHROMIUM_PATH=.*#CHROMIUM_PATH=\"$CHROME\"#" "$ENV_FILE"; else echo "CHROMIUM_PATH=\"$CHROME\"" >> "$ENV_FILE"; fi

say "تحديث قاعدة البيانات والبيانات المرجعية"
as_app "npx prisma migrate deploy && npm run db:seed"

say "خدمة التشغيل (systemd): تعمل دائماً وتسحب التحديثات وتأخذ نسخة يومية"
cat > /etc/systemd/system/sual.service <<EOF
[Unit]
Description=Sual AI (site + auto-update + daily backup)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=BIND_HOST=127.0.0.1
ExecStart=/usr/bin/node scripts/live.mjs
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable sual >/dev/null
systemctl restart sual

say "nginx (الوسيط أمام الموقع)"
cat > /etc/nginx/sites-available/sual <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 110m;          # رفع الكتب (الحد الدقيق لكل مسار في الموقع نفسه)
    proxy_read_timeout 300s;            # توليد الامتحان والتصدير قد يطولان
    proxy_send_timeout 300s;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
ln -sf /etc/nginx/sites-available/sual /etc/nginx/sites-enabled/sual
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

say "الجدار الناري و fail2ban والتحديثات الأمنية"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

say "شهادة HTTPS"
DOMAINS=(-d "$DOMAIN")
getent hosts "www.$DOMAIN" >/dev/null && DOMAINS+=(-d "www.$DOMAIN")
if certbot --nginx "${DOMAINS[@]}" --redirect --agree-tos -m "$LE_EMAIL" --non-interactive; then
  HTTPS_OK=1
else
  HTTPS_OK=0
  warn "لم تصدر الشهادة: غالباً النطاق لا يشير بعد إلى هذا الخادم (سجل A). بعد ضبطه شغّل:"
  echo "    sudo certbot --nginx ${DOMAINS[*]} --redirect -m $LE_EMAIL --agree-tos"
fi

# ── إغلاق الدخول بكلمة مرور (اختياري) ──
if [ -s /root/.ssh/authorized_keys ] || ls /home/*/.ssh/authorized_keys >/dev/null 2>&1; then
  read -rp "إغلاق الدخول إلى الخادم بكلمة مرور والاكتفاء بالمفتاح؟ (تأكد أنك تدخل بمفتاح أولاً) [y/N]: " ANS
  if [[ "${ANS:-N}" =~ ^[Yy]$ ]]; then
    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/60-sual-keys-only.conf
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    echo "تم: الدخول بالمفتاح فقط."
  fi
fi

say "انتظار أول بناء للموقع (دقائق قليلة)…"
for _ in $(seq 1 90); do
  curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 && break
  sleep 10
done
if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then echo "الموقع يعمل."; else warn "لم يستجب بعد؛ تابع:  sudo journalctl -u sual -f"; fi

cat <<EOF

────────────────────────────────────────────────────────────
✔ انتهى التنصيب.   الموقع: $([ "$HTTPS_OK" = 1 ] && echo "https" || echo "http")://$DOMAIN

ما تبقّى (مرة واحدة):
 1) املأ المفاتيح:          sudo nano $ENV_FILE      ثم   sudo systemctl restart sual
 2) أنشئ حساب المدير:       sudo -u $APP_USER -H bash -c 'cd $APP_DIR && npm run admin:create'
 3) انقل بياناتك من جهازك:  راجع deploy/README.md (القسم «نقل البيانات»)

أوامر مفيدة:
   السجل المباشر:  sudo journalctl -u sual -f
   إعادة التشغيل:  sudo systemctl restart sual
   نسخة الآن:      sudo -u $APP_USER -H bash -c 'cd $APP_DIR && npm run backup'
────────────────────────────────────────────────────────────
EOF
