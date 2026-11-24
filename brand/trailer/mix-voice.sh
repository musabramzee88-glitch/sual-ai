#!/usr/bin/env bash
# يدمج التعليق الصوتي المسجَّل مع التريلر والموسيقى:
#   bash brand/trailer/mix-voice.sh صوتك.m4a [تأخير_بالثواني] [captions]
# - الصوت: إزالة الهمهمة والضوضاء الخفيفة، ضغط ناعم، وتسوية الارتفاع لمعيار المنصات (-16 LUFS).
# - الموسيقى تنخفض تلقائياً حين تتكلم وترجع حين تسكت (ducking).
# - captions: يستعمل نسخة الفيديو التي فيها الكلام مكتوباً على الشاشة (أغلب الناس يشاهدون بلا صوت).
# الناتج: brand/trailer/sual-trailer-voice.mp4 (أو sual-trailer-voice-captions.mp4)
# التسجيل: شغّل recording-guide.mp4 واقرأ السطر الظاهر حين يمتلئ الشريط البرتقالي، وابدأ التسجيل مع بداية الفيديو.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
VOICE="${1:?اكتب مسار ملف الصوت، مثال: bash mix-voice.sh voice.m4a}"
OFFSET="${2:-0}"
MODE="${3:-}"
VIDEO="$DIR/sual-trailer-9x16-silent.mp4"; OUT="$DIR/sual-trailer-voice.mp4"
if [ "$MODE" = "captions" ]; then VIDEO="$DIR/sual-trailer-9x16-captions-silent.mp4"; OUT="$DIR/sual-trailer-voice-captions.mp4"; fi
MS=$(awk -v o="$OFFSET" 'BEGIN { printf "%d", o * 1000 }')
# تأخير سالب = الصوت بدأ قبل الفيديو: نقصّ من بدايته
TRIM=""; if [ "$MS" -lt 0 ]; then TRIM="atrim=start=$(awk -v m="$MS" 'BEGIN { printf "%.3f", -m / 1000 }'),asetpts=PTS-STARTPTS,"; MS=0; fi

ffmpeg -y -loglevel error -i "$VIDEO" -i "$DIR/music.m4a" -i "$VOICE" -filter_complex "
[2:a]${TRIM}aformat=sample_rates=44100:channel_layouts=stereo,highpass=f=80,lowpass=f=12000,afftdn=nf=-25,
 acompressor=threshold=-18dB:ratio=3:attack=5:release=120:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=7,
 adelay=${MS}|${MS},apad[v];
[v]asplit=2[vmix][vsc];
[1:a]volume=0.5[m];
[m][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=450[md];
[md][vmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "✔ $OUT"
