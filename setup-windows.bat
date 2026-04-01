@echo off
echo ============================================
echo   NFSE EMISSOR - RIBEIRAO PRETO
echo   Setup Inicial
echo ============================================
echo.

REM Verifica Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Por favor, instale o Node.js:
    echo https://nodejs.org/pt-br/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado: 
node --version
echo.

REM Entra na pasta do portal
cd portal

REM Instala dependencias
echo [INFO] Instalando dependencias...
echo.
call npm install

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   INSTALACAO CONCLUIDA!
echo ============================================
echo.
echo Proximos passos:
echo.
echo 1. Copie o arquivo .env.example para .env.local
echo    copy .env.example .env.local
echo.
echo 2. Edite .env.local com suas credenciais do Supabase
echo.
echo 3. Execute: npm run dev
echo.
echo 4. Acesse: http://localhost:3000
echo.
pause
