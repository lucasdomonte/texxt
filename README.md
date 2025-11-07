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
# Modo desenvolvimento
bun run dev

# Build para produção
bun run build

# Executar em produção
bun run start
```

O servidor estará disponível em `http://localhost:3030`

## 🎯 Uso

Acesse qualquer URL para criar um documento:

- `http://localhost:3030/home` - Cria documento "home"
- `http://localhost:3030/lucas` - Cria documento "lucas"
- `http://localhost:3030/lucas/matheus` - Cria documento "lucas/matheus"

Qualquer visitante pode editar o texto e as alterações são salvas automaticamente e sincronizadas em tempo real.

## 🛠️ Stack Técnica

- **Frontend**: Next.js 14 (React)
- **Estilo**: TailwindCSS + DaisyUI
- **Runtime**: Bun
- **Banco**: SQLite (better-sqlite3)
- **Tempo Real**: Server-Sent Events (SSE)

## 📁 Estrutura

```
├── app/
│   ├── api/
│   │   ├── doc/[...slug]/route.ts    # API GET/POST documentos
│   │   └── stream/[...slug]/route.ts # API SSE para tempo real
│   ├── [...slug]/page.tsx            # Página dinâmica de documentos
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── db.ts                         # Utilitários do banco SQLite
│   └── sse.ts                        # Gerenciador de conexões SSE
└── data/
    └── texxt.db                      # Banco de dados SQLite (criado automaticamente)
```

## 🔒 Segurança

- Sanitização de texto (remoção de tags HTML)
- Validação de tamanho máximo (200 KB)
- Proteção contra XSS
- Proteção de senha para leitura e gravação
- Sistema de bloqueio de URLs por administrador

## 👨‍💼 Painel de Administração

Acesse `http://localhost:3030/admin` para gerenciar todos os documentos.

**⚠️ IMPORTANTE**: Configure a senha do admin no arquivo `.env.local` antes de usar em produção!

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

### Configurar senha de admin:

Crie um arquivo `.env.local` na raiz do projeto:

```bash
ADMIN_PASSWORD=sua_senha_forte_aqui
```

**⚠️ IMPORTANTE**: Sempre configure uma senha forte em produção. A senha padrão é apenas para desenvolvimento local.
