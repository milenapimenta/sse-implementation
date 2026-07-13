# Front-end de Notificacoes SSE

Aplicacao React didatica para consumir uma API de notificacoes em tempo real baseada em Server-Sent Events. O front usa `fetch` para HTTP e `EventSource` nativo para o stream SSE.

## Tecnologias

- React + TypeScript
- Vite
- CSS puro
- `fetch`
- `EventSource` nativo
- Vitest
- React Testing Library
- Docker + Nginx para servir o build

## Estrutura

```text
src/
├── api/
│   ├── http-client.ts
│   ├── notifications-api.ts
│   └── system-api.ts
├── components/
│   ├── ConnectionPanel/
│   ├── ConnectionStatus/
│   ├── CreateNotificationForm/
│   ├── NotificationCard/
│   ├── NotificationList/
│   ├── StreamEvents/
│   └── SystemStatus/
├── hooks/
│   ├── use-notification-stream.ts
│   └── use-notifications.ts
├── services/
│   └── sse-client.ts
├── config/
│   └── env.ts
├── types/
├── utils/
├── App.tsx
├── main.tsx
└── styles/
```

## Configurar a URL da API

Crie `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Valor padrao:

```env
VITE_API_URL=http://localhost:3000
```

A URL e validada e exportada por `src/config/env.ts`. Os componentes nao usam URLs fixas.

## Executar localmente

Com a API rodando em `http://localhost:3000`:

```bash
npm install
npm run dev
```

Abra:

```text
http://localhost:5173
```

## Executar com Docker

Build manual:

```bash
docker build -t notifications-frontend .
docker run --rm -p 5173:80 notifications-frontend
```

Com Compose do front:

```bash
docker compose -f docker-compose.frontend.yml up --build
```

Para mudar a API no build:

```bash
VITE_API_URL=http://host.docker.internal:3000 \
docker compose -f docker-compose.frontend.yml up --build
```

O Nginx esta configurado com fallback para `index.html`, entao a SPA continua funcionando em refreshes.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm test
npm run test:watch
npm run typecheck
npm run lint
```

## Interface

A tela possui:

- Cabecalho com titulo, descricao e URL atual da API.
- Painel de conexao com `userId`, status, ultimo heartbeat, ultimo evento e nao lidas.
- Formulario para criar notificacoes de teste.
- Lista persistida de notificacoes com filtro por todas/nao lidas.
- Botao para marcar notificacao como lida.
- Painel de eventos recentes do stream, limitado a 50 itens.
- Painel de health check e metricas, atualizado somente sob demanda.

## Ciclo de vida do EventSource

O singleton `SseClient` e o unico proprietario do `EventSource` dentro do contexto JavaScript da pagina. O hook `useNotificationStream` apenas registra uma assinatura e traduz os eventos do singleton para estado React.

- reutiliza a conexao ativa quando `userId` e URL sao iguais;
- encerra e limpa a conexao anterior antes de conectar outro usuario ou URL;
- distribui eventos para um conjunto de assinantes do stream atual;
- fecha o stream quando o ultimo assinante e removido;
- usa uma geracao e a referencia do `EventSource` para ignorar callbacks atrasados;
- registra listeners para `connected`, `notification`, `ping` e `error`;
- remove todos os listeners antes de chamar `EventSource.close()`;
- fecha no disconnect manual, logout, troca de usuario e desmontagem;
- fecha sincronamente em `pagehide` e `beforeunload`;
- permite uma retomada controlada em `pageshow` vindo do bfcache, somente se o assinante ainda existir;
- nao implementa loop manual de reconexao;
- deixa o navegador respeitar o `retry` enviado pela API.

O metodo central `disconnect(reason)` e idempotente. Chamadas repetidas nao voltam a fechar a mesma conexao e invalidam callbacks antigos. O back-end detecta o encerramento da propria conexao HTTP; o front nao envia uma requisicao separada de logout.

Quando ocorre `error`, se o `readyState` for `CONNECTING`, o estado visual vira `Reconectando`. O singleton nao chama `connect()` dentro do `onerror`, evitando concorrer com a reconexao automatica nativa.

Em desenvolvimento, logs prefixados com `[SSE]` mostram conexao, reutilizacao, reconexao, desconexao, eventos de pagina e quantidade de assinantes, sem registrar credenciais.

### Limite por aba

O singleton garante uma conexao ativa por aba e por contexto JavaScript. Duas abas possuem dois contextos e, portanto, duas instancias independentes do singleton e duas conexoes no servidor. Coordenacao entre abas exigiria `BroadcastChannel`, `SharedWorker` ou eleicao de uma aba principal; isso nao faz parte desta implementacao.

## Deduplicacao

A API entrega eventos no modelo `at least once`, entao duplicatas podem acontecer. O front mescla notificacoes por `id` em todas as entradas:

- lista carregada por HTTP;
- evento recebido por SSE;
- notificacao recuperada durante reconexao da mesma instancia de `EventSource`;
- resposta de criacao quando o stream esta desconectado.

IDs sao tratados como `string`. O front nao converte IDs `BIGSERIAL` para `Number`; quando precisa ordenar IDs numericos iguais em data, usa `BigInt` apenas para comparacao.

## Last-Event-ID

Durante a reconexao automatica da mesma instancia de `EventSource`, o navegador envia `Last-Event-ID` ao servidor. O front exibe o ultimo `lastEventId` recebido e tambem salva esse valor no `localStorage` apenas para diagnostico.

Depois de um reload completo da pagina, o `EventSource` nativo nao permite configurar manualmente o header `Last-Event-ID`. Para recuperar eventos historicos apos reload, o back-end precisaria aceitar algo como `?lastEventId=10`, ou o front teria que usar outro cliente SSE que permita headers. Esta aplicacao nao altera esse comportamento silenciosamente.

## Testar usuarios diferentes

1. Conecte como `user-123`.
2. Crie uma notificacao para `user-456`.
3. A notificacao nao deve aparecer na lista de `user-123`.
4. Desconecte, informe `user-456`, conecte e atualize a lista para ver as notificacoes desse usuario.

## Testar multiplas abas

1. Abra `http://localhost:5173` em duas abas.
2. Conecte ambas como `user-123`.
3. Crie uma notificacao para `user-123`.
4. As duas abas devem receber o evento.
5. Atualize o painel de status da API e confirme duas conexoes.
6. Feche uma aba e confirme que apenas uma conexao permanece.

## Testar reconexao

1. Conecte como `user-123`.
2. Confirme eventos `connected` e `ping`.
3. Pare temporariamente a API.
4. O status deve ir para `Reconectando`.
5. Reinicie a API.
6. O mesmo `EventSource` deve voltar sem criar conexoes duplicadas.

## CORS

O front nao usa `mode: "no-cors"`. Para desenvolvimento local, a API precisa permitir:

```text
http://localhost:5173
```

Se a API estiver com:

```env
CORS_ORIGIN=*
```

a integracao local funciona sem configuracao adicional.

## Validacao sugerida

1. Inicie a API em `http://localhost:3000`.
2. Inicie o front em `http://localhost:5173`.
3. Informe `user-123`.
4. Clique em `Conectar`.
5. Confirme o evento `connected`.
6. Confirme eventos `ping`.
7. Crie uma notificacao para `user-123`.
8. Confirme que ela aparece imediatamente e sem duplicidade.
9. Crie uma notificacao para `user-456`.
10. Confirme que ela nao aparece para `user-123`.
11. Marque uma notificacao como lida.
12. Atualize a pagina e confirme a persistencia pela lista HTTP.
13. Abra duas abas e confirme duas conexoes em `/metrics`.
14. Feche uma aba e atualize as metricas.
15. Com uma unica aba conectada, renderize novamente a tela e confirme que `/metrics` continua mostrando uma conexao.
16. Troque o usuario e confirme que notificacoes do usuario anterior nao chegam ao novo estado.

## Limitacoes

- O front nao recupera `Last-Event-ID` depois de reload completo.
- O singleton nao coordena conexoes entre abas diferentes.
- Health check e metricas nao usam polling; atualizam no carregamento, botoes e acoes de conectar/desconectar.
- Notificacoes nativas do navegador sao opcionais e dependem de permissao explicita.
- A autenticacao segue o modelo didatico da API: `X-User-Id` em HTTP e `userId` na query do SSE.
