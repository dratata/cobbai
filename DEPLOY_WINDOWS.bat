@echo off
title CobbAI Vercel Deploy
echo.
echo === CobbAI deploy basliyor ===
echo Bu dosya: npm install, test, build ve vercel --prod calistirir.
echo.
where vercel >nul 2>nul
if errorlevel 1 (
  echo Vercel CLI bulunamadi. Kuruluyor...
  npm install -g vercel
)
echo.
echo [1/4] Bagimliliklar kuruluyor...
npm install
if errorlevel 1 goto fail

echo.
echo [2/4] Testler calisiyor...
npm test -- --run
if errorlevel 1 goto fail

echo.
echo [3/4] Production build aliniyor...
npm run build
if errorlevel 1 goto fail

echo.
echo [4/4] Vercel production deploy...
vercel --prod
if errorlevel 1 goto fail

echo.
echo === Deploy tamamlandi ===
echo Vercel Dashboard'da GEMINI_API_KEY environment variable ekli olmalidir.
pause
exit /b 0

:fail
echo.
echo !!! Islem hata verdi. Yukaridaki hata mesajini kopyalayip ChatGPT'ye gonder.
pause
exit /b 1
