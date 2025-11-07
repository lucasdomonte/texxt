import { Database } from 'bun:sqlite';
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
    requiresReadPassword INTEGER NOT NULL DEFAULT 0
  )
`);

// Migração: adicionar colunas se não existirem
try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN password TEXT;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN requiresPassword INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN formatType TEXT NOT NULL DEFAULT 'text';
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN requiresReadPassword INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN uniquePageviews INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN totalPageviews INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN isBlocked INTEGER NOT NULL DEFAULT 0;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN blockedReason TEXT;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

try {
  db.exec(`
    ALTER TABLE docs ADD COLUMN blockedAt INTEGER;
  `);
} catch (e) {
  // Coluna já existe, ignorar
}

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

// Índice para melhor performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_updatedAt ON docs(updatedAt)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_doc_visitors_path ON doc_visitors(path)
`);

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

// Funções de hash de senha
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

export function getDoc(path: string): Doc | null {
  const stmt = db.prepare('SELECT * FROM docs WHERE path = ?');
  const result = stmt.get(path) as Doc | undefined;
  if (!result) return null;
  // Converter requiresPassword de número para boolean se necessário
  return {
    ...result,
    requiresPassword: result.requiresPassword === 1 || result.requiresPassword === true,
    requiresReadPassword: (result as any).requiresReadPassword === 1 || (result as any).requiresReadPassword === true,
  };
}

export function createOrUpdateDoc(path: string, text: string, password?: string, formatType?: string): Doc {
  // Validar tamanho máximo (200 KB)
  const maxSize = 200 * 1024; // 200 KB em bytes
  if (Buffer.byteLength(text, 'utf8') > maxSize) {
    throw new Error('Documento excede o tamanho máximo de 200 KB');
  }

  // Se formatType não for fornecido, buscar do documento existente ou usar 'text'
  const existingDoc = getDoc(path);
  const finalFormatType = formatType || existingDoc?.formatType || 'text';

  const stmt = db.prepare(`
    INSERT INTO docs (path, text, updatedAt, password, formatType)
    VALUES (?, ?, strftime('%s', 'now'), ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      text = excluded.text,
      updatedAt = strftime('%s', 'now'),
      formatType = excluded.formatType
  `);
  
  const hashedPassword = password ? hashPassword(password) : null;
  stmt.run(path, text, hashedPassword, finalFormatType);
  
  const doc = getDoc(path);
  if (!doc) {
    throw new Error('Erro ao criar/atualizar documento');
  }
  
  return doc;
}

export function setDocPassword(path: string, password: string | null, requiresPassword: boolean): void {
  const hashedPassword = password ? hashPassword(password) : null;
  
  // Verificar se o documento existe
  const doc = getDoc(path);
  
  if (doc) {
    // Documento existe, fazer UPDATE
    const stmt = db.prepare(`
      UPDATE docs 
      SET password = ?, requiresPassword = ?
      WHERE path = ?
    `);
    stmt.run(hashedPassword, requiresPassword ? 1 : 0, path);
  } else {
    // Documento não existe, criar com senha
    const stmt = db.prepare(`
      INSERT INTO docs (path, text, updatedAt, password, requiresPassword)
      VALUES (?, ?, strftime('%s', 'now'), ?, ?)
    `);
    stmt.run(path, '', hashedPassword, requiresPassword ? 1 : 0);
  }
}

export function setDocAccess(
  path: string,
  password: string | null,
  requiresWritePassword: boolean,
  requiresReadPassword: boolean
): void {
  const doc = getDoc(path);
  
  if (doc) {
    // Se password for null, não atualizar a senha (manter a existente)
    if (password === null) {
      // Atualizar apenas as flags
      const stmt = db.prepare(`
        UPDATE docs
        SET requiresPassword = ?, requiresReadPassword = ?
        WHERE path = ?
      `);
      stmt.run(
        requiresWritePassword ? 1 : 0,
        requiresReadPassword ? 1 : 0,
        path
      );
    } else {
      // Atualizar senha e flags
      const hashedPassword = hashPassword(password);
      const stmt = db.prepare(`
        UPDATE docs
        SET password = ?, requiresPassword = ?, requiresReadPassword = ?
        WHERE path = ?
      `);
      stmt.run(
        hashedPassword,
        requiresWritePassword ? 1 : 0,
        requiresReadPassword ? 1 : 0,
        path
      );
    }
  } else {
    // Criar novo documento
    const hashedPassword = password ? hashPassword(password) : null;
    const stmt = db.prepare(`
      INSERT INTO docs (path, text, updatedAt, password, requiresPassword, requiresReadPassword)
      VALUES (?, ?, strftime('%s', 'now'), ?, ?, ?)
    `);
    stmt.run(path, '', hashedPassword, requiresWritePassword ? 1 : 0, requiresReadPassword ? 1 : 0);
  }
}

export function verifyDocPassword(path: string, password: string): boolean {
  const doc = getDoc(path);
  if (!doc || !doc.password) {
    return false;
  }
  return verifyPassword(password, doc.password);
}

export function getAllDocs(): Doc[] {
  const stmt = db.prepare('SELECT * FROM docs ORDER BY updatedAt DESC');
  const results = stmt.all() as Doc[];
  return results.map((doc) => ({
    ...doc,
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
    requiresReadPassword: (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true,
  }));
}

export function getDocsByPrefix(prefix: string): Doc[] {
  // Buscar documentos que começam com o prefixo seguido de /
  // e que são filhos diretos (apenas um nível abaixo)
  
  // Contar quantas barras tem no prefixo
  const prefixDepth = prefix ? (prefix.match(/\//g) || []).length : 0;
  const expectedDepth = prefixDepth + 1;
  
  if (!prefix) {
    // Caso especial: raiz - buscar documentos sem barra (filhos diretos da raiz)
    const stmt = db.prepare(`
      SELECT * FROM docs 
      WHERE path NOT LIKE '%/%'
      ORDER BY path ASC
    `);
    const results = stmt.all() as Doc[];
    return results.map((doc) => ({
      ...doc,
      requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
    requiresReadPassword: (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true,
    }));
  }
  
  // Caso normal: buscar documentos que começam com prefix/ e têm a profundidade esperada
  const searchPrefix = `${prefix}/`;
  const stmt = db.prepare(`
    SELECT * FROM docs 
    WHERE path LIKE ? || '%'
    AND path != ?
    AND (LENGTH(path) - LENGTH(REPLACE(path, '/', ''))) = ?
    ORDER BY path ASC
  `);
  
  const results = stmt.all(searchPrefix, prefix, expectedDepth) as Doc[];
  return results.map((doc) => ({
    ...doc,
    requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
  }));
}

// Registrar pageview
export function registerPageview(path: string, ip: string): void {
  // Verificar se o IP já visitou este documento
  const visitorStmt = db.prepare(`
    SELECT visitCount FROM doc_visitors 
    WHERE path = ? AND ip = ?
  `);
  const visitor = visitorStmt.get(path, ip) as { visitCount: number } | undefined;

  if (visitor) {
    // IP já visitou - atualizar contagem e última visita
    const updateVisitorStmt = db.prepare(`
      UPDATE doc_visitors 
      SET visitCount = visitCount + 1, lastVisit = strftime('%s', 'now')
      WHERE path = ? AND ip = ?
    `);
    updateVisitorStmt.run(path, ip);

    // Incrementar apenas totalPageviews
    const updateDocStmt = db.prepare(`
      UPDATE docs 
      SET totalPageviews = totalPageviews + 1
      WHERE path = ?
    `);
    updateDocStmt.run(path);
  } else {
    // Primeira visita deste IP - inserir novo registro
    const insertVisitorStmt = db.prepare(`
      INSERT INTO doc_visitors (path, ip, firstVisit, lastVisit, visitCount)
      VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'), 1)
    `);
    insertVisitorStmt.run(path, ip);

    // Incrementar uniquePageviews e totalPageviews
    const updateDocStmt = db.prepare(`
      UPDATE docs 
      SET uniquePageviews = uniquePageviews + 1, totalPageviews = totalPageviews + 1
      WHERE path = ?
    `);
    updateDocStmt.run(path);
  }
}

// Bloquear URL
export function blockDoc(path: string, reason?: string): void {
  
  try {
    // Verificar se o documento existe
    const doc = getDoc(path);
    
    if (doc) {
      // Documento existe, apenas atualizar
      const stmt = db.prepare(`
        UPDATE docs 
        SET isBlocked = 1, blockedReason = ?, blockedAt = strftime('%s', 'now')
        WHERE path = ?
      `);
      const result = stmt.run(reason || null, path);
    } else {
      // Documento não existe, criar com bloqueio
      const stmt = db.prepare(`
        INSERT INTO docs (path, text, updatedAt, isBlocked, blockedReason, blockedAt)
        VALUES (?, '', strftime('%s', 'now'), 1, ?, strftime('%s', 'now'))
      `);
      const result = stmt.run(path, reason || null);
    }
    
  } catch (error) {
    throw error;
  }
}

// Desbloquear URL
export function unblockDoc(path: string): void {
  // Verificar se o documento existe
  const doc = getDoc(path);
  
  if (doc) {
    // Documento existe, apenas atualizar
    const stmt = db.prepare(`
      UPDATE docs 
      SET isBlocked = 0, blockedReason = NULL, blockedAt = NULL
      WHERE path = ?
    `);
    stmt.run(path);
  }
  // Se não existe, não precisa fazer nada
}

// Verificar se URL está bloqueada
export function isDocBlocked(path: string): boolean {
  const doc = getDoc(path);
  return doc ? (doc.isBlocked === 1 || doc.isBlocked === true) : false;
}

export default db;

