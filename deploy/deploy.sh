#!/usr/bin/env bash

set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION não definida}"
: "${ECR_REGISTRY:?ECR_REGISTRY não definido}"
: "${ECR_API_REPOSITORY:?ECR_API_REPOSITORY não definido}"
: "${ECR_FRONTEND_REPOSITORY:?ECR_FRONTEND_REPOSITORY não definido}"
: "${IMAGE_TAG:?IMAGE_TAG não definida}"
: "${SSM_PARAMETER_NAME:?SSM_PARAMETER_NAME não definido}"

DEPLOY_DIRECTORY="/opt/estudo-sse"
COMPOSE_FILE="${DEPLOY_DIRECTORY}/docker-compose.production.yml"
ENV_FILE="${DEPLOY_DIRECTORY}/.env.production"

API_IMAGE="${ECR_REGISTRY}/${ECR_API_REPOSITORY}:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_REGISTRY}/${ECR_FRONTEND_REPOSITORY}:${IMAGE_TAG}"

echo "==> Iniciando deploy"
echo "API: ${API_IMAGE}"
echo "Frontend: ${FRONTEND_IMAGE}"

echo "==> Preparando diretório de produção"

install -d -m 0700 "${DEPLOY_DIRECTORY}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Docker Compose de produção não encontrado:" >&2
  echo "${COMPOSE_FILE}" >&2
  exit 1
fi

TEMP_ENV="$(mktemp "${DEPLOY_DIRECTORY}/.env.production.XXXXXX")"

cleanup() {
  rm -f "${TEMP_ENV}"
}

trap cleanup EXIT

echo "==> Recuperando configurações do Parameter Store"

aws ssm get-parameter \
  --region "${AWS_REGION}" \
  --name "${SSM_PARAMETER_NAME}" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  > "${TEMP_ENV}"

if [[ ! -s "${TEMP_ENV}" ]]; then
  echo "O Parameter Store retornou um valor vazio." >&2
  exit 1
fi

cat >> "${TEMP_ENV}" <<EOF

API_IMAGE=${API_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
EOF

chmod 0600 "${TEMP_ENV}"
mv "${TEMP_ENV}" "${ENV_FILE}"

trap - EXIT

COMPOSE_COMMAND=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

echo "==> Autenticando a EC2 no Amazon ECR"

aws ecr get-login-password \
  --region "${AWS_REGION}" |
  docker login \
    --username AWS \
    --password-stdin "${ECR_REGISTRY}"

echo "==> Validando o Docker Compose"

"${COMPOSE_COMMAND[@]}" config --quiet

echo "==> Baixando imagens da API e do frontend"

"${COMPOSE_COMMAND[@]}" pull api frontend

echo "==> Inicializando PostgreSQL e Redis"

"${COMPOSE_COMMAND[@]}" up -d postgres redis

wait_for_container() {
  local container="$1"
  local maximum_attempts="${2:-30}"
  local interval_seconds="${3:-5}"
  local status=""

  for attempt in $(seq 1 "${maximum_attempts}"); do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${container}" \
        2>/dev/null ||
        true
    )"

    echo "${container}: ${status:-not-created} (${attempt}/${maximum_attempts})"

    case "${status}" in
      healthy)
        return 0
        ;;

      running)
        # Containers sem healthcheck são considerados disponíveis
        # quando permanecem em execução.
        if [[ "$(
          docker inspect \
            --format '{{if .State.Health}}yes{{else}}no{{end}}' \
            "${container}" \
            2>/dev/null ||
            echo "no"
        )" == "no" ]]; then
          return 0
        fi
        ;;

      unhealthy|exited|dead)
        echo "O container ${container} falhou." >&2
        docker logs --tail 200 "${container}" || true
        return 1
        ;;
    esac

    sleep "${interval_seconds}"
  done

  echo "Timeout aguardando o container ${container}." >&2
  docker logs --tail 200 "${container}" || true
  return 1
}

echo "==> Aguardando PostgreSQL e Redis"

wait_for_container "estudo-sse-postgres" 30 5
wait_for_container "estudo-sse-redis" 30 5

echo "==> Verificando migrações de produção"

if "${COMPOSE_COMMAND[@]}" run \
  --rm \
  --no-deps \
  api \
  node -e \
  "const packageJson = require('./package.json'); process.exit(packageJson.scripts?.['db:migrate'] ? 0 : 1)"
then
  echo "==> Executando npm run db:migrate"

  "${COMPOSE_COMMAND[@]}" run \
    --rm \
    --no-deps \
    api \
    npm run db:migrate
else
  echo "Script db:migrate não encontrado. Migração automática ignorada."
fi

echo "==> Atualizando API e frontend"

"${COMPOSE_COMMAND[@]}" up \
  -d \
  --remove-orphans \
  api \
  frontend

echo "==> Aguardando API e frontend"

wait_for_container "estudo-sse-api" 30 5
wait_for_container "estudo-sse-frontend" 30 5

echo "==> Containers da aplicação"

"${COMPOSE_COMMAND[@]}" ps

echo "==> Exibindo imagens implantadas"

docker inspect \
  --format='{{.Name}} -> {{.Config.Image}}' \
  estudo-sse-api \
  estudo-sse-frontend

echo "==> Removendo imagens sem uso"

docker image prune --force

echo "Deploy concluído com sucesso."