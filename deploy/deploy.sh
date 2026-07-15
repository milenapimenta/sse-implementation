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

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y "$@"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache "$@"
    return
  fi

  echo "Gerenciador de pacotes não encontrado para instalar: $*" >&2
  return 1
}

ensure_aws_cli() {
  if command -v aws >/dev/null 2>&1; then
    return
  fi

  echo "==> AWS CLI não encontrado. Instalando AWS CLI v2"

  install_packages curl unzip

  local architecture
  local aws_cli_url
  local temporary_directory

  architecture="$(uname -m)"

  case "${architecture}" in
    x86_64|amd64)
      aws_cli_url="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
      ;;

    aarch64|arm64)
      aws_cli_url="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"
      ;;

    *)
      echo "Arquitetura não suportada para AWS CLI: ${architecture}" >&2
      return 1
      ;;
  esac

  temporary_directory="$(mktemp -d)"

  (
    cd "${temporary_directory}"
    curl --fail --location --silent --show-error \
      "${aws_cli_url}" \
      --output awscliv2.zip
    unzip -q awscliv2.zip
    ./aws/install --update
  )

  rm -rf "${temporary_directory}"

  command -v aws >/dev/null 2>&1
}

echo "==> Iniciando deploy"
echo "API: ${API_IMAGE}"
echo "Frontend: ${FRONTEND_IMAGE}"

echo "==> Preparando diretório de produção"

install -d -m 0700 "${DEPLOY_DIRECTORY}"
ensure_aws_cli

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

echo "==> Executando migrações de produção"

"${COMPOSE_COMMAND[@]}" run \
  --rm \
  --no-deps \
  api \
  npm run migrate:prod

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
