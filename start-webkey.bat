@echo off
title Jebtool WebKey Admin Portal
cd /d "%~dp0"
echo Dang khoi dong Jebtool WebKey C# Server tai http://localhost:5050 ...
start "" http://localhost:5050
backend\JebtoolWebKeyServer.exe 5050
pause
