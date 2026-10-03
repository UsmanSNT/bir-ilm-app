@echo off
rem Bir Ilm: bitta buyruq bilan yangilash. Ishga tushirish: C:\bir-ilm\app\scripts\deploy.cmd
rem Fayl o'zini vaqtinchalik nusxadan yurgizadi (git pull ish paytida shu faylni almashtirib yubormasligi uchun).
if "%~1"=="--copy" goto :main
copy /y "%~f0" "%TEMP%\bir-ilm-deploy.cmd" >nul
call "%TEMP%\bir-ilm-deploy.cmd" --copy
exit /b

:main
setlocal
cd /d C:\bir-ilm\app || (echo [XATO] C:\bir-ilm\app topilmadi & exit /b 1)
set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite
set STOPPED=0

echo.
echo [1/7] Zaxira nusxa...
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%d
if not exist C:\bir-ilm\backups mkdir C:\bir-ilm\backups
node scripts\backup-db.mjs C:\bir-ilm\backups\before-deploy-%STAMP%.sqlite || goto :fail

echo.
echo [2/7] Xizmatlarni to'xtatish (Site, Chat)...
schtasks /end /tn BirIlm-Site
schtasks /end /tn BirIlm-Chat
set STOPPED=1

echo.
echo [3/7] Yangi kodni olish (git pull)...
git pull || goto :fail
git log --oneline -1

echo.
echo [4/7] Kutubxonalar (pnpm install)...
call pnpm install --frozen-lockfile || goto :fail

echo.
echo [5/7] Yig'ish (pnpm build) - bir necha daqiqa...
call pnpm build || goto :fail

echo.
echo [6/7] Ishga tushirish: Site, keyin Chat...
schtasks /run /tn BirIlm-Site
ping -n 25 127.0.0.1 >nul
curl -s http://127.0.0.1:8787/api/v1/health
echo.
curl -s http://127.0.0.1:8787/api/v1/health | findstr /c:connected >nul || (echo [XATO] Sayt javob bermayapti & goto :fail_run)
schtasks /run /tn BirIlm-Chat
ping -n 8 127.0.0.1 >nul

echo.
echo [7/7] Tekshiruv (8787 va 8788 LISTENING bo'lishi kerak)...
netstat -ano | findstr ":8787 :8788"
echo.
echo [TAYYOR] Yangilandi. Brauzerda Ctrl+F5 qiling.
exit /b 0

:fail
echo.
echo [XATO] Yangilash to'xtadi. Yuqoridagi oxirgi qatorlarni yuboring.
if "%STOPPED%"=="1" goto :fail_run
exit /b 1

:fail_run
echo.
echo Saytni o'chiq qoldirmaslik uchun xizmatlar qayta ishga tushirilmoqda...
schtasks /run /tn BirIlm-Site
ping -n 25 127.0.0.1 >nul
schtasks /run /tn BirIlm-Chat
exit /b 1
