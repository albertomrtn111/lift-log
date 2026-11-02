#!/usr/bin/env bash
# Despliega la web de NexTrain (main) en el servidor de producción.
#
# Se ejecuta desde el Mac del dueño, que tiene la clave SSH. Hace:
#   1. Comprobaciones: servidor limpio (solo `.env` sin seguimiento), ficheros
#      del usuario alberto y migraciones nuevas confirmadas.
#   2. Etiqueta las imágenes actuales como rollback-<revisión anterior> y borra las
#      de rollback más antiguas (se quedan las KEEP_ROLLBACKS últimas) y la caché de
#      build sin usar. Si aun así quedan menos de MIN_FREE_GB libres, no despliega.
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
#   REBUILD=1 scripts/deploy-web.sh              repite la build si el servidor ya tiene el código
#                                                de main pero la build anterior falló
#
# Guía completa: docs/despliegue.md
set -euo pipefail

SSH_KEY="${NEXTTRAIN_SSH_KEY:-/Users/albertomrtn/SERVIDORALBERTO@2026}"
SSH_HOST="${NEXTTRAIN_SSH_HOST:-alberto@72.61.167.159}"
APP_DIR=/srv/NextTrain
SITE=https://nexttrain.ascenttech.cloud
SERVICES="nexttrain_app supplement_reminder_worker"
IMAGES="nexttrain-nexttrain_app nexttrain-supplement_reminder_worker"
# Cada despliegue tiene su propio log (/tmp/nexttrain-build-<revisión>.log) y
# /tmp/nexttrain-build.log apunta siempre al último.
LATEST_LOG=/tmp/nexttrain-build.log
# Cada despliegue guarda ~1,8 GB por imagen de rollback y el disco es de 49 GB: el
# 2026-11-02 se llenó y la build murió al desempaquetar con 1,2 GB libres.
KEEP_ROLLBACKS=3
MIN_FREE_GB=5

cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }
fail() { echo "ERROR: $1" >&2; exit 1; }
remote() { ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" "$@"; }
free_gb() { remote "df -Pk / | awk 'NR==2 { print int(\$4 / 1048576) }'"; }
# Borra las imágenes rollback-* de NexTrain salvo las KEEP_ROLLBACKS más recientes y la
# caché de build que ya no usa ninguna imagen. No toca imágenes de otras apps del servidor.
prune_rollbacks() {
  remote "for image in $IMAGES; do
      docker images \$image --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' | grep ':rollback-' \\
        | sort -r | tail -n +$((KEEP_ROLLBACKS + 1)) | cut -f2 | xargs -r docker rmi >/dev/null
    done
    docker builder prune -f | tail -1"
}

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
    if [ "$CURRENT" = "$TARGET" ] && [ "${REBUILD:-}" != "1" ]; then
      echo "El servidor ya está en $TARGET. Nada que desplegar."
      echo "Si la build anterior falló y los contenedores siguen con la versión vieja, repite con REBUILD=1."
      exit 0
    fi
    # Dos despliegues a la vez se pisan: comparten imágenes y el segundo podía dar por buena
    # la build del primero. [d]ocker: que pgrep no se encuentre a sí mismo.
    BUSY=$(remote "pgrep -af '[d]ocker compose (build|up)' || true")
    [ -z "$BUSY" ] || fail "Hay otro despliegue en curso en el servidor:
$BUSY
Espera a que termine (scripts/deploy-web.sh status) y vuelve a lanzar este."
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
    step "Disco"
    FREE=$(free_gb)
    echo "Libre: $FREE GB (mínimo $MIN_FREE_GB GB; el despliegue borra antes los rollbacks antiguos)."
    if [ "$1" = check ]; then echo; echo "Comprobaciones correctas: $CURRENT → $TARGET. Despliega con scripts/deploy-web.sh"; exit 0; fi

    step "Rollback, código y build"
    LOG=/tmp/nexttrain-build-$TARGET.log
    # La build escribe esta marca al terminar; se espera a la de esta revisión, no a cualquier DEPLOY_OK.
    OK_MARK="DEPLOY_OK $TARGET"
    # Con REBUILD=1 la imagen latest puede ser la de la build fallida: no se guarda como rollback.
    if [ "$CURRENT" != "$TARGET" ]; then
      remote "for image in $IMAGES; do docker tag \$image:latest \$image:rollback-$CURRENT; done"
    fi
    echo "Limpieza: se quedan las $KEEP_ROLLBACKS imágenes de rollback más recientes."
    prune_rollbacks
    FREE=$(free_gb)
    [ "$FREE" -ge "$MIN_FREE_GB" ] || fail "Solo quedan $FREE GB libres en el servidor (mínimo $MIN_FREE_GB GB) tras la limpieza. Revisa \`docker system df\` antes de desplegar."
    echo "Libre: $FREE GB."
    remote "set -e; cd $APP_DIR
      git fetch -q origin main
      git merge --ff-only -q origin/main
      echo \"Código: \$(git log --oneline -1)\"
      ln -sf $LOG $LATEST_LOG
      (nohup sh -c 'docker compose build $SERVICES && docker compose up -d --no-deps $SERVICES && echo \"$OK_MARK\"' > $LOG 2>&1 < /dev/null &)"
    if [ "$CURRENT" = "$TARGET" ]; then
      # REBUILD: el rollback útil es el último guardado, no la revisión actual.
      CURRENT=$(remote "docker images nexttrain-nexttrain_app --format '{{.CreatedAt}}\t{{.Tag}}' | grep rollback- | sort -r | head -1 | cut -f2 | sed 's/^rollback-//'")
      echo "Repitiendo la build de $TARGET; rollback disponible: rollback-$CURRENT. Construyendo (varios minutos)…"
    else
      echo "Imágenes anteriores guardadas como rollback-$CURRENT. Construyendo (varios minutos)…"
    fi

    for _ in $(seq 1 90); do
      sleep 10
      TAIL=$(remote "tail -c 600 $LOG" || true)
      if printf '%s' "$TAIL" | grep -qF "$OK_MARK"; then break; fi
      # [d]ocker: que pgrep no se encuentre a sí mismo en la línea de órdenes del SSH.
      # ssh sale con 255 si se corta la conexión: la build sigue en el servidor, se vuelve a mirar.
      RC=0; remote "pgrep -f '[d]ocker compose' >/dev/null" || RC=$?
      if [ "$RC" = 255 ]; then echo "(conexión SSH cortada; la build sigue en el servidor, reintento)"; continue; fi
      if [ "$RC" != 0 ]; then
        TAIL=$(remote "tail -c 1500 $LOG" || true)
        if printf '%s' "$TAIL" | grep -qF "$OK_MARK"; then break; fi
        printf '%s\n' "$TAIL"
        fail "La build ha terminado sin $OK_MARK. Log completo: $LOG en el servidor. Para volver atrás: scripts/deploy-web.sh rollback $CURRENT"
      fi
    done
    printf '%s' "$TAIL" | grep -qF "$OK_MARK" || fail "La build sigue tras 15 minutos; revisa $LOG en el servidor."

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
