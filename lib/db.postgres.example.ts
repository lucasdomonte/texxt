// EXEMPLO: Adaptação do db.ts para PostgreSQL (Vercel Postgres)
// Este é um exemplo de como adaptar o código para usar PostgreSQL
// Substitua lib/db.ts por esta versão após configurar o banco

import { sql } from '@vercel/postgres';
import crypto from 'crypto';

// Interface mantida igual
export interface Doc {
  path: string;
  text: string;
  updatedAt: number;
  password?: string | null;
  requiresPassword?: number | boolean;
  formatType?: string;
  requiresReadPassword?: number | boolean;
  uniquePageviews?: number;
  totalPageviews?: number;
  isBlocked?: number | boolean;
  blockedReason?: string | null;
  blockedAt?: number | null;
}

// Inicializar tabelas (executar uma vez)
export async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS docs (
      path TEXT PRIMARY KEY,
      text TEXT NOT NULL DEFAULT '',
      updatedAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      password TEXT,
      requiresPassword INTEGER NOT NULL DEFAULT 0,
      formatType TEXT NOT NULL DEFAULT 'text',
      requiresReadPassword INTEGER NOT NULL DEFAULT 0,
      uniquePageviews INTEGER NOT NULL DEFAULT 0,
      totalPageviews INTEGER NOT NULL DEFAULT 0,
      isBlocked INTEGER NOT NULL DEFAULT 0,
      blockedReason TEXT,
      blockedAt BIGINT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS doc_visitors (
      path TEXT NOT NULL,
      ip TEXT NOT NULL,
      firstVisit BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      lastVisit BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      visitCount INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (path, ip),
      FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_updatedAt ON docs(updatedAt)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_doc_visitors_path ON doc_visitors(path)
  `;
}

// Funções de hash (mantidas iguais)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, hashValue] = hash.split(':');
  if (!salt || !hashValue) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hashValue === verifyHash;
}

// Adaptar getDoc para PostgreSQL
export async function getDoc(path: string): Promise<Doc | null> {
  const result = await sql`
    SELECT * FROM docs WHERE path = ${path}
  `;
  
  if (result.rows.length === 0) return null;
  
  const doc = result.rows[0] as Doc;
  return {
    ...doc,
    updatedAt: Number(doc.updatedAt),
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
    requiresReadPassword: doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
  };
}

// Adaptar createOrUpdateDoc
export async function createOrUpdateDoc(
  path: string,
  text: string,
  password?: string,
  formatType?: string
): Promise<Doc> {
  const maxSize = 200 * 1024;
  if (Buffer.byteLength(text, 'utf8') > maxSize) {
    throw new Error('Documento excede o tamanho máximo de 200 KB');
  }

  const existingDoc = await getDoc(path);
  const finalFormatType = formatType || existingDoc?.formatType || 'text';
  const hashedPassword = password ? hashPassword(password) : null;
  const updatedAt = Math.floor(Date.now() / 1000);

  await sql`
    INSERT INTO docs (path, text, updatedAt, password, formatType)
    VALUES (${path}, ${text}, ${updatedAt}, ${hashedPassword}, ${finalFormatType})
    ON CONFLICT(path) DO UPDATE SET
      text = EXCLUDED.text,
      updatedAt = ${updatedAt},
      formatType = EXCLUDED.formatType
  `;

  const doc = await getDoc(path);
  if (!doc) {
    throw new Error('Erro ao criar/atualizar documento');
  }

  return doc;
}

// Adaptar outras funções seguindo o mesmo padrão...
// (setDocPassword, setDocAccess, verifyDocPassword, getAllDocs, etc.)

// Exemplo de getAllDocs
export async function getAllDocs(): Promise<Doc[]> {
  const result = await sql`
    SELECT * FROM docs ORDER BY updatedAt DESC
  `;
  
  return result.rows.map((doc) => ({
    ...doc,
    updatedAt: Number(doc.updatedAt),
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
    requiresReadPassword: doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
  }));
}

// IMPORTANTE: Todas as funções precisam ser convertidas para async/await
// e usar sql`...` ao invés de db.prepare()

