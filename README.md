# Notificacoes em tempo real com SSE

Projeto didatico de uma API de notificacoes em tempo real usando Node.js, TypeScript, Express, Server-Sent Events, PostgreSQL, Redis Pub/Sub, Docker e Docker Compose.

O foco da implementacao e manter o stream SSE correto, observavel e simples de testar: sem WebSockets, sem polling e sem consultas periodicas ao banco.

## Tecnologias

- Node.js + TypeScript
- Express
- Server-Sent Events
- PostgreSQL com SQL direto via `pg`
- Redis Pub/Sub com `ioredis`
- Zod para validacao
- Pino para logs estruturados
- Vitest para testes
- Docker e Docker Compose

## Arquitetura

```text
src/
├── app.ts
├── server.ts
├── config/
├── database/
├── redis/
├── modules/
│   └── notifications/
├── sse/
├── middlewares/
├── utils/
└── tests/
```

Responsabilidades principais:

- `modules/notifications`: validacao, rotas, controller, service e repository.
- `sse`: formatacao oficial SSE, handler HTTP e gerenciador de conexoes.
- `database`: singleton do pool PostgreSQL, health check e runner de migrations.
- `redis`: singletons separados para publisher, subscriber e operacoes gerais.
- `lifecycle`: coordenacao de graceful shutdown.

Os singletons valem por processo Node.js. Se a API rodar com duas replicas,
dois containers, cluster mode ou multiplos workers, cada processo tera seu
proprio pool PostgreSQL e seus tres clientes Redis. Isso e esperado; objetos
JavaScript nao sao compartilhados entre processos.

## Fluxo da notificacao

```text
POST /api/notifications
        ↓
valida payload
        ↓
salva no PostgreSQL
        ↓
publica no Redis no canal "notifications"
        ↓
todas as instancias da API recebem o evento
        ↓
a instancia que possui conexoes do usuario envia via SSE
```

## PostgreSQL

O PostgreSQL e a fonte persistente das notificacoes. A tabela usa `BIGSERIAL` como `id`, o que tambem serve como identificador sequencial do evento SSE. Isso facilita a recuperacao com `Last-Event-ID`.

A API mantem uma unica instancia de `pg.Pool` por processo. Esse singleton e
um pool compartilhado, nao uma unica conexao fisica; o proprio `pg` administra
as conexoes internas conforme `DATABASE_POOL_MAX`.

O total potencial de conexoes no banco e aproximadamente:

```text
numero de processos da API x DATABASE_POOL_MAX
```

Exemplo: 4 replicas com `DATABASE_POOL_MAX=10` podem abrir ate 40 conexoes no
PostgreSQL.

Repositories recebem o pool por injecao de dependencia durante o bootstrap.
Health checks usam `pool.query("select 1")` e nao criam nem encerram pools.
Transacoes, como as migrations, usam `pool.connect()` com `release()` em
`finally`.

A migration cria indices por:

- `user_id`
- `created_at`
- `(user_id, created_at)`
- `(user_id, id)`
- notificacoes nao lidas por usuario

## Redis

O Redis e usado apenas para distribuir eventos entre instancias da API.

Este projeto usa um unico canal, `notifications`, em vez de um canal por usuario. A decisao mantem a implementacao menor e evita criar uma assinatura Redis por conexao SSE. Cada instancia recebe o evento e filtra localmente pelo `userId` antes de escrever nos streams abertos.

Existem clientes Redis separados para:

- `command`: operacoes gerais e health check
- `publisher`: `publish`
- `subscriber`: `subscribe` e recebimento de `message`

Esses tres clientes tambem sao singletons por processo. O subscriber nao e
usado para comandos gerais porque, apos `subscribe`, uma conexao Redis entra em
modo Pub/Sub. A inicializacao da assinatura e idempotente: chamadas repetidas
reutilizam a mesma promise, nao registram `message` mais de uma vez e nao criam
subscribers adicionais.

O `ioredis` usa `lazyConnect: true`, mas as chamadas a `connect()` ficam
centralizadas no bootstrap/gerenciador Redis. A reconexao fica a cargo do
`ioredis` via `retryStrategy`; a aplicacao nao cria clientes novos em eventos
de erro.

## SSE

O endpoint de stream e:

```http
GET /api/notifications/stream
```

Autenticacao simulada:

```http
X-User-Id: user-123
```

Para o cliente HTML, tambem e aceito:

```http
GET /api/notifications/stream?userId=user-123
```

Essa autenticacao e apenas didatica. Em producao, o `userId` deve vir de uma sessao, JWT ou outro mecanismo confiavel.

Headers configurados no stream:

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Eventos seguem o formato oficial:

```text
id: 1
event: notification
data: {"id":"1","title":"Nova mensagem"}

```

Ao conectar, a API envia:

```text
retry: 3000

event: connected
data: {"connected":true}

```

Tambem envia heartbeats periodicos:

```text
event: ping
data: {"timestamp":"2026-01-01T12:00:00.000Z"}

```

O gerenciador usa `Map<string, Set<SseClient>>`, permitindo varias conexoes por usuario. Se `response.write()` retornar `false`, a conexao e considerada lenta, encerrada e removida. Isso evita que um cliente com backpressure bloqueie a aplicacao.

O handler remove a conexao de forma idempotente ao receber `request.close`, `response.close` ou `response.error`. Esse cleanup cancela o heartbeat no `SseManager`, remove os listeners HTTP e impede novas escritas para o cliente encerrado.

## Reconexao e Last-Event-ID

O servidor envia `retry`, entao clientes `EventSource` tentam reconectar automaticamente.

Quando o cliente reconecta com:

```http
Last-Event-ID: 10
```

a API busca no PostgreSQL notificacoes daquele usuario com `id > 10` e envia antes de continuar com eventos em tempo real.

Para reduzir a janela de perda, a conexao e registrada no `SseManager` antes da busca das notificacoes perdidas. Isso pode gerar eventos duplicados em uma corrida entre Redis e recuperacao historica, mas evita perder eventos importantes. A entrega e `at least once`; o cliente deve deduplicar usando o `id`.

## Executar com Docker

```bash
docker compose up --build
```

A API fica em:

```text
http://localhost:3000
```

O container da API executa as migrations antes de iniciar o servidor.

## Executar sem Docker

Instale dependencias:

```bash
npm install
```

Suba PostgreSQL e Redis localmente e configure `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notifications
DATABASE_POOL_MAX=10
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=5000
REDIS_URL=redis://localhost:6379
SSE_HEARTBEAT_INTERVAL_MS=15000
SSE_RETRY_MS=3000
LOG_LEVEL=info
CORS_ORIGIN=*
NODE_ENV=development
```

Rode migrations:

```bash
npm run migrate
```

Inicie a API:

```bash
npm run dev
```

## Testes

Unitarios:

```bash
npm run test:unit
```

Integracao com PostgreSQL e Redis:

```bash
docker compose up -d postgres redis
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/notifications \
REDIS_URL=redis://localhost:56379 \
RUN_INTEGRATION_TESTS=true \
npm test
```

Typecheck e lint:

```bash
npm run typecheck
npm run lint
```

## Exemplos com curl

Abrir stream:

```bash
curl -N \
  -H "X-User-Id: user-123" \
  http://localhost:3000/api/notifications/stream
```

O argumento `-N` desabilita o buffering do `curl`, permitindo ver os eventos assim que chegam.

Criar notificacao:

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "type": "message",
    "title": "Nova mensagem",
    "message": "Você recebeu uma nova mensagem."
  }'
```

Listar notificacoes:

```bash
curl \
  -H "X-User-Id: user-123" \
  "http://localhost:3000/api/notifications?limit=20&unreadOnly=false"
```

Marcar como lida:

```bash
curl -X PATCH \
  -H "X-User-Id: user-123" \
  http://localhost:3000/api/notifications/1/read
```

Health check:

```bash
curl http://localhost:3000/health
```

Metricas simples:

```bash
curl http://localhost:3000/metrics
```

A resposta mantem os campos antigos de SSE e inclui diagnosticos seguros:

```json
{
  "sseConnections": 2,
  "connectedUsers": 1,
  "sse": {
    "connections": 2,
    "connectedUsers": 1
  },
  "postgres": {
    "totalConnections": 1,
    "idleConnections": 1,
    "waitingRequests": 0
  },
  "redis": {
    "command": "ready",
    "publisher": "ready",
    "subscriber": "ready"
  }
}
```

## Cliente HTML

Abra:

```text
http://localhost:3000/
```

O cliente permite informar `userId`, abrir/fechar conexao, criar notificacoes, ver eventos `connected`, `notification`, `ping`, erros e reconexoes. Como `EventSource` nativo nao permite headers customizados, ele usa `userId` por query string.

## Testar usuarios diferentes

Terminal 1:

```bash
curl -N -H "X-User-Id: user-123" http://localhost:3000/api/notifications/stream
```

Terminal 2:

```bash
curl -N -H "X-User-Id: user-456" http://localhost:3000/api/notifications/stream
```

Crie uma notificacao para `user-123`. Apenas o primeiro stream deve receber `event: notification`.

## Testar multiplas abas

Abra dois streams para o mesmo usuario:

```bash
curl -N -H "X-User-Id: user-123" http://localhost:3000/api/notifications/stream
```

Crie uma notificacao para `user-123`. As duas conexoes devem receber o mesmo evento.

## Testar reconexao

1. Abra um stream e observe o ultimo `id` recebido.
2. Encerre o stream.
3. Crie novas notificacoes para o mesmo usuario.
4. Reconecte enviando `Last-Event-ID`.

```bash
curl -N \
  -H "X-User-Id: user-123" \
  -H "Last-Event-ID: 1" \
  http://localhost:3000/api/notifications/stream
```

As notificacoes com `id > 1` devem ser reenviadas.

## Validacao manual completa

1. `docker compose up --build`
2. Abra um stream para `user-123`.
3. Abra outro stream para `user-456`.
4. Crie uma notificacao para `user-123`.
5. Confirme que apenas `user-123` recebeu.
6. Abra uma segunda conexao para `user-123`.
7. Crie outra notificacao.
8. Confirme que as duas conexoes de `user-123` receberam.
9. Encerre uma conexao.
10. Consulte `GET /metrics` e confirme a remocao.
11. Reinicie a API.
12. Reconecte usando `Last-Event-ID`.
13. Confirme que notificacoes perdidas foram recuperadas.
14. Confirme persistencia no PostgreSQL:

```bash
docker compose exec postgres psql -U postgres -d notifications \
  -c "select id, user_id, title, created_at from notifications order by id;"
```

## Limitacoes

- A entrega e `at least once`, nao `exactly once`.
- A recuperacao por `Last-Event-ID` busca ate 100 notificacoes perdidas por reconexao.
- O endpoint `POST /api/notifications` e um produtor didatico. Em producao, ele deve ser protegido por autorizacao real ou substituido por eventos internos da aplicacao.
- Nao ha outbox transacional. Se o PostgreSQL salvar e o Redis falhar em seguida, a notificacao persiste, mas o evento em tempo real pode nao ser publicado.
- Nao ha Prometheus; `/metrics` retorna apenas contadores simples.
- O modo de desenvolvimento usa `tsx watch`, que reinicia o processo. Por isso
  nao foi necessario guardar singletons em `globalThis`; em HMR dentro do mesmo
  processo, essa decisao deveria ser reavaliada.

## Melhorias para producao

- Autenticacao real e autorizacao por escopo.
- Outbox pattern para publicar eventos de forma confiavel apos commit no banco.
- Observabilidade com Prometheus/OpenTelemetry.
- Limites por usuario/IP mais refinados.
- Retencao, arquivamento e paginacao mais robusta.
- Suporte a multiplas replicas atras de proxy com configuracao explicita de buffering/timeouts.
- Testes de carga para conexoes SSE longas.
