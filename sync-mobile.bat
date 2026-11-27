@echo off
REM تحديث تلقائي لنسخة التطبيق: عدّل المسار أدناه إلى مجلد تطبيقك مرة واحدة فقط ثم اتركه شغّالاً
set APP_DIR=C:\Users\%USERNAME%\Desktop\sual_app
cd /d "%~dp0"
node scripts\sync-mobile.mjs "%APP_DIR%"
pause
