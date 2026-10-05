@echo off
setlocal
where corepack >nul 2>nul || (echo Node.js 22+ no esta instalado. & pause & exit /b 1)
corepack enable
corepack prepare pnpm@11.25.0 --activate
if not exist node_modules (
  pnpm install
  if errorlevel 1 exit /b 1
)
pnpm dev
