#!/usr/bin/env bash
# Despliega la web de NexTrain (main) en el servidor de producción.
#
# Se ejecuta desde el Mac del dueño, que tiene la clave SSH. Hace:
#   1. Comprobaciones: servidor limpio (solo `.env` sin seguimiento), ficheros
#      del usuario alberto y migraciones nuevas confirmadas.
#   2. Etiqueta las imágenes actuales como rollback-<revisión anterior>.
#   3. Trae origin/main con fast-forward.
#   4. Construye y reinicia solo nexttrain_app y supplement_reminder_worker,
#      desacoplado del SSH (las builds largas cortaban la conexión).
#   5. Espera a que termine y comprueba que la web responde.
#
# Uso:
#   scripts/deploy-web.sh                        despliega origin/main
#   MIGRATIONS_APPLIED=1 scripts/deploy-web.sh   si main trae migraciones y ya están aplicadas
#   scripts/deploy-web.sh check                  solo las comprobaciones, sin desplegar
#   scripts/deploy-web.sh status                 revisión del servidor, contenedores e imágenes de rollback
#   scripts/deploy-web.sh rollback <revisión>    vuelve a las imágenes rollback-<revisión>
#
# Guía completa: docs/despliegue.md
set -euo pipefail

SSH_KEY="${NEXTTRAIN_SSH_KEY:-/Users/albertomrtn/SERVIDORALBERTO@2026}"
SSH_HOST="${NEXTTRAIN_SSH_HOST:-alberto@72.61.167.159}"
APP_DIR=/srv/NextTrain
SITE=https://nexttrain.ascenttech.cloud
SERVICES="nexttrain_app supplement_reminder_worker"
IMAGES="nexttrain-nexttrain_app nexttrain-supplement_reminder_worker"
LOG=/tmp/nexttrain-build.log

cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }
fail() { echo "ERROR: $1" >&2; exit 1; }
remote() { ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" "$@"; }

[ -f "$SSH_KEY" ] || fail "No encuentro la clave SSH en $SSH_KEY (define NEXTTRAIN_SSH_KEY)."

set -- "${1:-deploy}" "${@:2}"
case "$1" in
  status)
    remote "cd $APP_DIR && echo \"Revisión: \$(git log --oneline -1)\" && git status --short \
      && docker ps --filter name=nexttrain --format '{{.Names}}  {{.Status}}' \
      && echo 'Imágenes de rollback:' && docker images --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep ':rollback-' | head -10 || true"
    exit 0
    ;;
  rollback)
    REV="${2:-}"
    [ -n "$REV" ] || fail "Indica la revisión: scripts/deploy-web.sh rollback <revisión> (ver scripts/deploy-web.sh status)."
    step "Rollback a las imágenes rollback-$REV"
    remote "set -e; cd $APP_DIR
      for image in $IMAGES; do
        docker image inspect \$image:rollback-$REV >/dev/null 2>&1 || { echo \"No existe \$image:rollback-$REV\" >&2; exit 1; }
      done
      for image in $IMAGES; do docker tag \$image:rollback-$REV \$image:latest; done
      docker compose up -d --no-deps $SERVICES"
    echo "Contenedores con las imágenes de $REV. El código en $APP_DIR sigue en la revisión nueva: el próximo despliegue lo reconstruye."
    ;;
  deploy|check)
    step "Código en GitHub"
    git fetch -q origin main
    TARGET=$(git rev-parse --short origin/main)
    echo "origin/main: $(git log --oneline -1 origin/main)"

    step "Servidor"
    CURRENT=$(remote "cd $APP_DIR && git rev-parse --short HEAD")
    echo "Revisión actual: $CURRENT"
    [ "$CURRENT" != "$TARGET" ] || { echo "El servidor ya está en $TARGET. Nada que desplegar."; exit 0; }
    DIRTY=$(remote "cd $APP_DIR && git status --porcelain | grep -v '^?? .env$' || true")
    [ -z "$DIRTY" ] || fail "El servidor tiene cambios locales además de .env:
$DIRTY
Revísalos a mano antes de desplegar (nunca borres ni sustituyas el .env)."
    FOREIGN=$(remote "cd $APP_DIR && find . -path ./node_modules -prune -o ! -user alberto -print 2>/dev/null | head -5")
    [ -z "$FOREIGN" ] || fail "Hay ficheros que no son de alberto (git merge fallaría):
$FOREIGN
Ver «Ficheros de root» en docs/despliegue.md."

    step "Migraciones"
    MIGRATIONS=$(git diff --name-only --diff-filter=A "$CURRENT" origin/main -- supabase/migrations)
    if [ -n "$MIGRATIONS" ]; then
      echo "main trae migraciones nuevas:"
      echo "$MIGRATIONS"
      [ "${MIGRATIONS_APPLIED:-}" = "1" ] || fail "Aplícalas en Supabase (con permiso del dueño) y repite con MIGRATIONS_APPLIED=1."
      echo "Confirmadas como aplicadas."
    else
      echo "Ninguna."
    fi
    if [ "$1" = check ]; then echo; echo "Comprobaciones correctas: $CURRENT → $TARGET. Despliega con scripts/deploy-web.sh"; exit 0; fi

    step "Rollback, código y build"
    remote "set -e; cd $APP_DIR
      for image in $IMAGES; do docker tag \$image:latest \$image:rollback-$CURRENT; done
      git fetch -q origin main
      git merge --ff-only -q origin/main
      echo \"Código: \$(git log --oneline -1)\"
      (nohup sh -c 'docker compose build $SERVICES && docker compose up -d --no-deps $SERVICES && echo DEPLOY_OK' > $LOG 2>&1 < /dev/null &)"
    echo "Imágenes anteriores guardadas como rollback-$CURRENT. Construyendo (varios minutos)…"

    for _ in $(seq 1 90); do
      sleep 10
      TAIL=$(remote "tail -c 600 $LOG" || true)
      if printf '%s' "$TAIL" | grep -q DEPLOY_OK; then break; fi
      # [d]ocker: que pgrep no se encuentre a sí mismo en la línea de órdenes del SSH
      if ! remote "pgrep -f '[d]ocker compose' >/dev/null"; then
        TAIL=$(remote "tail -c 1500 $LOG" || true)
        if printf '%s' "$TAIL" | grep -q DEPLOY_OK; then break; fi
        printf '%s\n' "$TAIL"
        fail "La build ha terminado sin DEPLOY_OK. Log completo: $LOG en el servidor. Para volver atrás: scripts/deploy-web.sh rollback $CURRENT"
      fi
    done
    printf '%s' "$TAIL" | grep -q DEPLOY_OK || fail "La build sigue tras 15 minutos; revisa $LOG en el servidor."

    step "Comprobación"
    sleep 8
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/login")
    remote "docker ps --filter name=nexttrain --format '{{.Names}}  {{.Status}}'"
    [ "$CODE" = "200" ] || fail "$SITE/login responde $CODE. Para volver atrás: scripts/deploy-web.sh rollback $CURRENT"
    echo "$SITE/login → 200"
    echo
    echo "Desplegado $TARGET (antes $CURRENT). Rollback: scripts/deploy-web.sh rollback $CURRENT"
    ;;
  *)
    fail "Uso: scripts/deploy-web.sh [deploy|check|status|rollback <revisión>]"
    ;;
esac
