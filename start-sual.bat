@echo off
REM تشغيل سؤال AI مع التحديث التلقائي من GitHub. انقر مرتين على هذا الملف واترك النافذة مفتوحة.
chcp 65001 >nul
title Sual AI - live
cd /d "%~dp0"
call npm run live
pause
