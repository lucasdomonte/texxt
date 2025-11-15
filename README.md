# Texxt

**Texxt** é um editor de texto colaborativo em tempo real, minimalista e poderoso. Crie documentos instantaneamente através de URLs dinâmicas, com salvamento automático e sincronização em tempo real.

## 🚀 Funcionalidades

- ✅ URLs dinâmicas e persistentes
- ✅ Salvamento automático (autosave) com debounce de 1.2s
- ✅ Atualização em tempo real via Server-Sent Events (SSE)
- ✅ Interface minimalista e responsiva
- ✅ Proteção contra XSS
- ✅ Validação de tamanho máximo (200 KB por documento)

## 📦 Instalação

```bash
# Instalar dependências
bun install

# Inicializar banco de dados (cria automaticamente na primeira execução)
bun run db:init
```

## 🏃 Executar

```bash
# Modo desenvolvimento (porta 3030 - padrão)
npm run dev
# ou
bun run dev

# Modo desenvolvimento (porta 3000 - alternativa)
npm run dev:3000
# ou
bun run dev:3000

# Build para produção
npm run build
# ou
bun run build

# Executar em produção (porta 3030 - padrão)
npm run start
# ou
bun run start

# Executar em produção (porta 3000 - alternativa)
npm run start:3000
# ou
bun run start:3000
```

O servidor estará disponível em:

- `http://localhost:3030` (porta padrão do projeto)
- `http://localhost:3000` (se usar `dev:3000` ou `start:3000`)

**Ou configure via variável de ambiente:**

```bash
PORT=8080 npm run dev  # Qualquer porta que quiser
```

## 🎯 Uso

Acesse qualquer URL para criar um documento:

- `http://localhost:3030/home` - Cria documento "home"
- `http://localhost:3030/lucas` - Cria documento "lucas"
- `http://localhost:3030/lucas/matheus` - Cria documento "lucas/matheus"

Qualquer visitante pode editar o texto e as alterações são salvas automaticamente e sincronizadas em tempo real.

## 🛠️ Stack Técnica

- **Frontend**: Next.js 14 (React)
- **Estilo**: TailwindCSS + DaisyUI
- **Runtime**: Node.js (compatível com Bun)
- **Banco**: PostgreSQL (Vercel Postgres)
- **Tempo Real**: Server-Sent Events (SSE)
- **Deploy**: Vercel (pronto para produção)

## 📁 Estrutura

```
├── app/
│   ├── api/
│   │   ├── doc/[...slug]/route.ts         # API GET/POST documentos
│   │   ├── doc/[...slug]/unlock/route.ts # API desbloquear leitura
│   │   ├── doc/[...slug]/password-extended/route.ts # API configurar acesso
│   │   └── stream/[...slug]/route.ts     # API SSE para tempo real
│   ├── [...slug]/page.tsx                # Página dinâmica de documentos
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── db.ts                             # Utilitários do banco PostgreSQL
│   └── sse.ts                            # Gerenciador de conexões SSE
└── scripts/
    └── init-db-postgres.ts               # Script de inicialização do banco
```

## 🔒 Segurança

- Sanitização de texto (remoção de tags HTML)
- Validação de tamanho máximo (200 KB)
- Proteção contra XSS
- Proteção de senha para leitura e gravação
- Sistema de bloqueio de URLs por administrador

## 👨‍💼 Painel de Administração

Acesse `http://localhost:3030/admin` para gerenciar todos os documentos.

**⚠️ IMPORTANTE**: Configure a senha do admin no arquivo `.env.local` antes de usar!

### Funcionalidades do Admin:

- ✅ Listar todos os documentos
- ✅ Ver estatísticas (total de docs, bloqueados, visualizações)
- ✅ Bloquear/Desbloquear URLs
- ✅ Adicionar motivo ao bloquear
- ✅ Ver visualizações únicas e totais
- ✅ Filtrar e ordenar documentos
- ✅ Ver proteções de senha
- ✅ **Trocar senha do admin**
- ✅ **Trocar senha de documentos protegidos**

### Configurar variáveis de ambiente:

1. Copie o arquivo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

2. Edite o arquivo `.env.local` e configure a senha do admin:

```bash
ADMIN_PASSWORD=sua_senha_forte_aqui
```

**⚠️ IMPORTANTE**:

- Sempre configure uma senha forte antes de usar em produção
- O arquivo `.env.local` não será commitado no Git (já está no .gitignore)
- Nunca compartilhe ou commite o arquivo `.env.local` com senhas reais

## 🚀 Deploy na Vercel

Este projeto está pronto para deploy na Vercel! Veja o guia completo em [`DEPLOY_VERCEL.md`](./DEPLOY_VERCEL.md).

### Resumo rápido:

1. Criar banco Vercel Postgres no dashboard
2. Configurar variáveis de ambiente (`POSTGRES_URL`, `ADMIN_PASSWORD`, etc.)
3. Fazer deploy: `vercel --prod`

O banco será inicializado automaticamente na primeira execução.
