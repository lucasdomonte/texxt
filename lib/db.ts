// Por padrão, sempre usar SQLite local
// Na Vercel (produção), o Next.js vai usar db.postgres.ts automaticamente
export * from './db.local';

// Re-exportar funções de sessão que são comuns
export {
  createDocSession,
  verifyDocSession,
  invalidateDocSessions,
  invalidateDocSession,
  cleanupExpiredSessions,
} from './db.local';
