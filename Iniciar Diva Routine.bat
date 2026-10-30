@echo off
cd /d "%~dp0"
where node >nul 2>nul || (
  echo No se encuentra Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  pause
  exit /b 1
)
rem Abre el navegador cuando el servidor ya esta en marcha (2 segundos).
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5177"
:arrancar
node server.js
rem Codigo 75: la app pidio reiniciarse (p. ej. al cambiar la carpeta de datos en Ajustes).
if %errorlevel%==75 goto arrancar
pause
