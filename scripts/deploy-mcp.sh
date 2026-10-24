#!/usr/bin/env bash
# Despliega la Edge Function del MCP de NexTrain (nexttrain-mcp) en Supabase.
#
# Solo despliega desde origin/main sin cambios locales en la función ni en
# src/lib (de donde importa módulos compartidos), y después de pasar
# deno check y todos los tests. Necesita una sesión de la CLI de Supabase:
#   npx -y supabase@latest login
#
# Uso: scripts/deploy-mcp.sh            (desde cualquier carpeta del repo)
#      ALLOW_NON_MAIN=1 scripts/deploy-mcp.sh   para desplegar otra revisión a propósito
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_REF=kqwstdbdocbynvijnpka
FUNCTION=nexttrain-mcp
DENO="npx -y deno@2.1.4"
SUPABASE="npx -y supabase@latest"

step() { printf '\n== %s\n' "$1"; }

step "Código"
if [ -n "$(git status --porcelain -- "supabase/functions/$FUNCTION" src/lib)" ]; then
  echo "Hay cambios sin commitear en la función o en src/lib. Commitéalos o descártalos antes de desplegar." >&2
  exit 1
fi
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && [ "${ALLOW_NON_MAIN:-}" != "1" ]; then
  echo "Esta copia no está en origin/main ($(git rev-parse --short HEAD) frente a $(git rev-parse --short origin/main))." >&2
  echo "Haz git checkout origin/main o usa ALLOW_NON_MAIN=1 si es intencionado." >&2
  exit 1
fi
echo "Revisión: $(git rev-parse --short HEAD) · versión del servidor MCP: $(grep -oE "version: '[0-9.]+'" "supabase/functions/$FUNCTION/index.ts")"

# Sin node_modules: Deno detectaría el package.json de la web y buscaría ahí las dependencias npm:
step "deno check"
$DENO check --node-modules-dir=none "supabase/functions/$FUNCTION/index.ts"

step "Tests del MCP (Deno)"
$DENO test --node-modules-dir=none --allow-env --allow-read "supabase/functions/$FUNCTION/"

step "Tests de módulos compartidos (Node)"
node --test scripts/mcp-*.test.mjs scripts/cardio-*.test.mjs scripts/diet-macros.test.mjs

step "Sesión de la CLI de Supabase"
if ! $SUPABASE projects list >/dev/null 2>&1; then
  echo "No hay sesión iniciada. Ejecuta: npx -y supabase@latest login" >&2
  exit 1
fi

step "Despliegue"
# La función valida el token OAuth del entrenador por sí misma (withOAuthProtectedResource),
# por eso el gateway no debe exigir JWT. No extender esta opción a otras funciones.
$SUPABASE functions deploy "$FUNCTION" --project-ref "$PROJECT_REF" --no-verify-jwt

step "Versión en marcha"
$SUPABASE functions list --project-ref "$PROJECT_REF" | grep -E "$FUNCTION|NAME" || true
echo
echo "Desplegado $FUNCTION desde $(git rev-parse --short HEAD)."
