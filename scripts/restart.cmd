@echo off
rem Faqat qayta ishga tushirish (kod o'zgarmaydi): C:\bir-ilm\app\scripts\restart.cmd
echo [1/4] To'xtatish...
schtasks /end /tn BirIlm-Site
schtasks /end /tn BirIlm-Chat
ping -n 5 127.0.0.1 >nul
echo [2/4] Site ishga tushmoqda...
schtasks /run /tn BirIlm-Site
ping -n 25 127.0.0.1 >nul
curl -s http://127.0.0.1:8787/api/v1/health
echo.
echo [3/4] Chat ishga tushmoqda...
schtasks /run /tn BirIlm-Chat
ping -n 8 127.0.0.1 >nul
echo [4/4] Tekshiruv (8787 va 8788 LISTENING bo'lishi kerak):
netstat -ano | findstr ":8787 :8788"
echo.
echo Xizmat holati:
schtasks /query /tn BirIlm-Site /fo list /v | findstr /c:"Status" /c:"Last Result"
schtasks /query /tn BirIlm-Chat /fo list /v | findstr /c:"Status" /c:"Last Result"
