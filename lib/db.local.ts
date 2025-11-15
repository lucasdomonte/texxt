// Versão SQLite para desenvolvimento local
// Use este arquivo quando não tiver PostgreSQL configurado

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dbPath = path.join(process.cwd(), 'data', 'texxt.db');

// Garantir que o diretório existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Criar tabela se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    path TEXT PRIMARY KEY,
    text TEXT NOT NULL DEFAULT '',
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    password TEXT,
    requiresPassword INTEGER NOT NULL DEFAULT 0,
    formatType TEXT NOT NULL DEFAULT 'text',
    requiresReadPassword INTEGER NOT NULL DEFAULT 0,
    uniquePageviews INTEGER NOT NULL DEFAULT 0,
    totalPageviews INTEGER NOT NULL DEFAULT 0,
    isBlocked INTEGER NOT NULL DEFAULT 0,
    blockedReason TEXT,
    blockedAt INTEGER
  )
`);

// Criar tabela para rastrear IPs únicos por documento
db.exec(`
  CREATE TABLE IF NOT EXISTS doc_visitors (
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    firstVisit INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    lastVisit INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    visitCount INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (path, ip),
    FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
  )
`);

// Criar tabela para tokens de sessão de documentos
db.exec(`
  CREATE TABLE IF NOT EXISTS doc_sessions (
    path TEXT NOT NULL,
    userId TEXT NOT NULL,
    token TEXT NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expiresAt INTEGER NOT NULL,
    PRIMARY KEY (path, userId),
    FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
  )
`);

// Índices
db.exec(`CREATE INDEX IF NOT EXISTS idx_updatedAt ON docs(updatedAt)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_doc_visitors_path ON doc_visitors(path)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_doc_sessions_path ON doc_sessions(path)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_doc_sessions_token ON doc_sessions(token)`);

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

export async function getDoc(path: string): Promise<Doc | null> {
  const stmt = db.prepare('SELECT * FROM docs WHERE path = ?');
  const result = stmt.get(path) as Doc | undefined;
  if (!result) return null;
  return {
    ...result,
    requiresPassword: result.requiresPassword === 1 || result.requiresPassword === true,
    requiresReadPassword: (result as any).requiresReadPassword === 1 || (result as any).requiresReadPassword === true,
  };
}

export async function createOrUpdateDoc(path: string, text: string, password?: string, formatType?: string): Promise<Doc> {
  const maxSize = 200 * 1024;
  if (Buffer.byteLength(text, 'utf8') > maxSize) {
    throw new Error('Documento excede o tamanho máximo de 200 KB');
  }

  const existingDoc = await getDoc(path);
  const finalFormatType = formatType || existingDoc?.formatType || 'text';
  const hashedPassword = password ? hashPassword(password) : null;

  const stmt = db.prepare(`
    INSERT INTO docs (path, text, updatedAt, password, formatType)
    VALUES (?, ?, strftime('%s', 'now'), ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      text = excluded.text,
      updatedAt = strftime('%s', 'now'),
      formatType = excluded.formatType
  `);
  
  stmt.run(path, text, hashedPassword, finalFormatType);
  
  const doc = await getDoc(path);
  if (!doc) {
    throw new Error('Erro ao criar/atualizar documento');
  }
  
  return doc;
}

export async function setDocPassword(path: string, password: string | null, requiresPassword: boolean): Promise<void> {
  const hashedPassword = password ? hashPassword(password) : null;
  const doc = await getDoc(path);

  if (doc) {
    const stmt = db.prepare(`UPDATE docs SET password = ?, requiresPassword = ? WHERE path = ?`);
    stmt.run(hashedPassword, requiresPassword ? 1 : 0, path);
  } else {
    const stmt = db.prepare(`INSERT INTO docs (path, text, updatedAt, password, requiresPassword) VALUES (?, ?, strftime('%s', 'now'), ?, ?)`);
    stmt.run(path, '', hashedPassword, requiresPassword ? 1 : 0);
  }
}

export async function setDocAccess(path: string, password: string | null, requiresWritePassword: boolean, requiresReadPassword: boolean): Promise<void> {
  const doc = await getDoc(path);

  if (doc) {
    if (password === null) {
      const stmt = db.prepare(`UPDATE docs SET requiresPassword = ?, requiresReadPassword = ? WHERE path = ?`);
      stmt.run(requiresWritePassword ? 1 : 0, requiresReadPassword ? 1 : 0, path);
    } else {
      const hashedPassword = hashPassword(password);
      const stmt = db.prepare(`UPDATE docs SET password = ?, requiresPassword = ?, requiresReadPassword = ? WHERE path = ?`);
      stmt.run(hashedPassword, requiresWritePassword ? 1 : 0, requiresReadPassword ? 1 : 0, path);
    }
  } else {
    const hashedPassword = password ? hashPassword(password) : null;
    const stmt = db.prepare(`INSERT INTO docs (path, text, updatedAt, password, requiresPassword, requiresReadPassword) VALUES (?, ?, strftime('%s', 'now'), ?, ?, ?)`);
    stmt.run(path, '', hashedPassword, requiresWritePassword ? 1 : 0, requiresReadPassword ? 1 : 0);
  }
}

export async function verifyDocPassword(path: string, password: string): Promise<boolean> {
  const doc = await getDoc(path);
  if (!doc || !doc.password) {
    return false;
  }
  return verifyPassword(password, doc.password);
}

export async function getAllDocs(): Promise<Doc[]> {
  const stmt = db.prepare('SELECT * FROM docs ORDER BY updatedAt DESC');
  const results = stmt.all() as Doc[];
  return results.map((doc) => ({
    ...doc,
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
    requiresReadPassword: (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true,
  }));
}

export async function getDocsByPrefix(prefix: string): Promise<Doc[]> {
  const prefixDepth = prefix ? (prefix.match(/\//g) || []).length : 0;
  const expectedDepth = prefixDepth + 1;

  if (!prefix) {
    const stmt = db.prepare(`SELECT * FROM docs WHERE path NOT LIKE '%/%' ORDER BY path ASC`);
    const results = stmt.all() as Doc[];
    return results.map((doc) => ({
      ...doc,
      requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
      requiresReadPassword: (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true,
    }));
  }

  const searchPrefix = `${prefix}/`;
  const stmt = db.prepare(`SELECT * FROM docs WHERE path LIKE ? || '%' AND path != ? AND (LENGTH(path) - LENGTH(REPLACE(path, '/', ''))) = ? ORDER BY path ASC`);
  const results = stmt.all(searchPrefix, prefix, expectedDepth) as Doc[];
  return results.map((doc) => ({
    ...doc,
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
  }));
}

export async function registerPageview(path: string, ip: string): Promise<void> {
  const visitorStmt = db.prepare(`SELECT visitCount FROM doc_visitors WHERE path = ? AND ip = ?`);
  const visitor = visitorStmt.get(path, ip) as { visitCount: number } | undefined;

  if (visitor) {
    const updateVisitorStmt = db.prepare(`UPDATE doc_visitors SET visitCount = visitCount + 1, lastVisit = strftime('%s', 'now') WHERE path = ? AND ip = ?`);
    updateVisitorStmt.run(path, ip);
    const updateDocStmt = db.prepare(`UPDATE docs SET totalPageviews = totalPageviews + 1 WHERE path = ?`);
    updateDocStmt.run(path);
  } else {
    const doc = await getDoc(path);
    if (!doc) {
      await createOrUpdateDoc(path, '');
    }
    const insertVisitorStmt = db.prepare(`INSERT INTO doc_visitors (path, ip, firstVisit, lastVisit, visitCount) VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'), 1)`);
    insertVisitorStmt.run(path, ip);
    const updateDocStmt = db.prepare(`UPDATE docs SET uniquePageviews = uniquePageviews + 1, totalPageviews = totalPageviews + 1 WHERE path = ?`);
    updateDocStmt.run(path);
  }
}

export async function blockDoc(path: string, reason?: string): Promise<void> {
  try {
    const doc = await getDoc(path);
    if (doc) {
      const stmt = db.prepare(`UPDATE docs SET isBlocked = 1, blockedReason = ?, blockedAt = strftime('%s', 'now') WHERE path = ?`);
      stmt.run(reason || null, path);
    } else {
      const stmt = db.prepare(`INSERT INTO docs (path, text, updatedAt, isBlocked, blockedReason, blockedAt) VALUES (?, '', strftime('%s', 'now'), 1, ?, strftime('%s', 'now'))`);
      stmt.run(path, reason || null);
    }
  } catch (error) {
    throw error;
  }
}

export async function unblockDoc(path: string): Promise<void> {
  const doc = await getDoc(path);
  if (doc) {
    const stmt = db.prepare(`UPDATE docs SET isBlocked = 0, blockedReason = NULL, blockedAt = NULL WHERE path = ?`);
    stmt.run(path);
  }
}

export async function isDocBlocked(path: string): Promise<boolean> {
  const doc = await getDoc(path);
  return doc ? (doc.isBlocked === 1 || doc.isBlocked === true) : false;
}

// Funções para gerenciar tokens de sessão de documentos
export async function createDocSession(path: string, userId: string, token: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (30 * 24 * 60 * 60); // 30 dias
  
  const stmt = db.prepare(`
    INSERT INTO doc_sessions (path, userId, token, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path, userId) DO UPDATE SET
      token = excluded.token,
      createdAt = excluded.createdAt,
      expiresAt = excluded.expiresAt
  `);
  
  stmt.run(path, userId, token, now, expiresAt);
}

export async function verifyDocSession(path: string, userId: string, token: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    SELECT token FROM doc_sessions 
    WHERE path = ? 
      AND userId = ? 
      AND token = ?
      AND expiresAt > ?
  `);
  
  const result = stmt.get(path, userId, token, now) as { token: string } | undefined;
  return !!result;
}

export async function invalidateDocSessions(path: string): Promise<void> {
  const stmt = db.prepare(`DELETE FROM doc_sessions WHERE path = ?`);
  stmt.run(path);
}

export async function invalidateDocSession(path: string, userId: string): Promise<void> {
  const stmt = db.prepare(`DELETE FROM doc_sessions WHERE path = ? AND userId = ?`);
  stmt.run(path, userId);
}

// Limpar sessões expiradas
export async function cleanupExpiredSessions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`DELETE FROM doc_sessions WHERE expiresAt <= ?`);
  stmt.run(now);
}

export async function initDatabase() {
  // SQLite não precisa de inicialização assíncrona
  // Limpar sessões expiradas na inicialização
  cleanupExpiredSessions().catch(() => {
    // Ignorar erros
  });
}

