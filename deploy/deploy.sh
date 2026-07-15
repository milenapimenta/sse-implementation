#!/usr/bin/env bash

set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION não definida}"
: "${ECR_REGISTRY:?ECR_REGISTRY não definido}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY não definido}"
: "${IMAGE_TAG:?IMAGE_TAG não definida}"
: "${SSM_PARAMETER_NAME:?SSM_PARAMETER_NAME não definido}"

DEPLOY_DIRECTORY="/opt/estudo-sse"
COMPOSE_FILE="${DEPLOY_DIRECTORY}/docker-compose.production.yml"
ENV_FILE="${DEPLOY_DIRECTORY}/.env.production"

echo "==> Preparando diretório de produção"

install -d -m 0700 "${DEPLOY_DIRECTORY}"

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

cat >> "${TEMP_ENV}" <<EOF

API_IMAGE=${ECR_REGISTRY}/${ECR_REPOSITORY}:api-${IMAGE_TAG}
FRONTEND_IMAGE=${ECR_REGISTRY}/${ECR_REPOSITORY}:frontend-${IMAGE_TAG}
EOF

chmod 0600 "${TEMP_ENV}"
mv "${TEMP_ENV}" "${ENV_FILE}"

trap - EXIT

echo "==> Autenticando a EC2 no ECR"

aws ecr get-login-password \
  --region "${AWS_REGION}" |
  docker login \
    --username AWS \
    --password-stdin "${ECR_REGISTRY}"

echo "==> Validando o Docker Compose"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  config --quiet

echo "==> Baixando imagens"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  pull

echo "==> Atualizando containers"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  up -d --remove-orphans

wait_for_container() {
  local container="$1"
  local status=""

  for attempt in $(seq 1 30); do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${container}" 2>/dev/null || true
    )"

    echo "${container}: ${status:-not-created}"

    case "${status}" in
      healthy|running)
        return 0
        ;;

      unhealthy|exited|dead)
        docker logs --tail 200 "${container}" || true
        return 1
        ;;
    esac

    sleep 5
  done

  echo "Timeout aguardando ${container}."
  docker logs --tail 200 "${container}" || true
  return 1
}

echo "==> Verificando os containers"

wait_for_container "estudo-sse-postgres"
wait_for_container "estudo-sse-redis"
wait_for_container "estudo-sse-api"
wait_for_container "estudo-sse-frontend"

docker ps \
  --filter name=estudo-sse-postgres \
  --filter name=estudo-sse-redis \
  --filter name=estudo-sse-api \
  --filter name=estudo-sse-frontend

docker image prune -f

echo "Deploy concluído com sucesso."