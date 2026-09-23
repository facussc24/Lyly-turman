@echo off
chcp 65001 >nul
title Simulador de Civilizaciones
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js. Bajalo de https://nodejs.org ^(version LTS^) y volve a abrir este archivo.
  echo  Mientras tanto podes abrir index.html directo ^(sin Claude^).
  echo.
  pause
  exit /b
)
node server.js --abrir
pause
