// Versão PostgreSQL para produção (Vercel)
// Este arquivo será usado apenas quando POSTGRES_URL estiver configurado
import { sql } from '@vercel/postgres';
import crypto from 'crypto';

// Inicializar banco de dados (executar uma vez)
let dbInitialized = false;

export async function initDatabase() {
  if (dbInitialized) return;
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS docs (
        path TEXT PRIMARY KEY,
        text TEXT NOT NULL DEFAULT '',
        updatedAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
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
        firstVisit BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        lastVisit BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        visitCount INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (path, ip),
        FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS doc_sessions (
        path TEXT NOT NULL,
        userId TEXT NOT NULL,
        token TEXT NOT NULL,
        createdAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        expiresAt BIGINT NOT NULL,
        PRIMARY KEY (path, userId),
        FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_updatedAt ON docs(updatedAt)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_doc_visitors_path ON doc_visitors(path)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_doc_sessions_path ON doc_sessions(path)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_doc_sessions_token ON doc_sessions(token)`;

    dbInitialized = true;
  } catch (error: any) {
    if (!error.message?.includes('already exists')) {
      console.error('Erro ao inicializar banco:', error);
    }
    dbInitialized = true;
  }
}

if (typeof window === 'undefined') {
  initDatabase().catch(console.error);
}

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
  await initDatabase();
  
  // Selecionar campos explicitamente para garantir ordem correta
  const result = await sql`
    SELECT 
      path, 
      text, 
      updatedAt, 
      password, 
      requiresPassword, 
      requiresReadPassword,
      formatType,
      uniquePageviews,
      totalPageviews,
      isBlocked,
      blockedReason,
      blockedAt
    FROM docs 
    WHERE path = ${path}
  `;
  
  if (result.rows.length === 0) return null;
  
  const doc = result.rows[0] as any;
  
  // Garantir conversão correta de booleanos (não pode ser string/hash)
  const requiresPasswordValue = doc.requirespassword ?? doc.requiresPassword;
  const requiresReadPasswordValue = doc.requiresreadpassword ?? doc.requiresReadPassword;
  const isBlockedValue = doc.isblocked ?? doc.isBlocked;
  
  // Validação: garantir que valores sejam sempre booleanos
  const requiresPasswordBool = (typeof requiresPasswordValue === 'number' && requiresPasswordValue !== 0) || 
                               requiresPasswordValue === true ||
                               requiresPasswordValue === 1;
  
  const requiresReadPasswordBool = (typeof requiresReadPasswordValue === 'number' && requiresReadPasswordValue !== 0) || 
                                   requiresReadPasswordValue === true ||
                                   requiresReadPasswordValue === 1;
  
  const isBlockedBool = (typeof isBlockedValue === 'number' && isBlockedValue !== 0) || 
                        isBlockedValue === true ||
                        isBlockedValue === 1;
  
  return {
    path: String(doc.path || ''),
    text: String(doc.text || ''),
    updatedAt: Number(doc.updatedat || doc.updatedAt || 0),
    password: doc.password || null,
    requiresPassword: Boolean(requiresPasswordBool),
    formatType: String(doc.formattype || doc.formatType || 'text'),
    requiresReadPassword: Boolean(requiresReadPasswordBool),
    uniquePageviews: Number(doc.uniquepageviews || doc.uniquePageviews || 0),
    totalPageviews: Number(doc.totalpageviews || doc.totalPageviews || 0),
    isBlocked: Boolean(isBlockedBool),
    blockedReason: doc.blockedreason || doc.blockedReason || null,
    blockedAt: doc.blockedat ? Number(doc.blockedat) : (doc.blockedAt ? Number(doc.blockedAt) : null),
  };
}

export async function createOrUpdateDoc(path: string, text: string, password?: string, formatType?: string): Promise<Doc> {
  await initDatabase();
  
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

export async function setDocPassword(path: string, password: string | null, requiresPassword: boolean): Promise<void> {
  await initDatabase();
  
  const hashedPassword = password ? hashPassword(password) : null;
  const doc = await getDoc(path);
  const updatedAt = Math.floor(Date.now() / 1000);

  if (doc) {
    await sql`UPDATE docs SET password = ${hashedPassword}, requiresPassword = ${requiresPassword ? 1 : 0} WHERE path = ${path}`;
  } else {
    await sql`INSERT INTO docs (path, text, updatedAt, password, requiresPassword) VALUES (${path}, '', ${updatedAt}, ${hashedPassword}, ${requiresPassword ? 1 : 0})`;
  }
}

export async function setDocAccess(path: string, password: string | null, requiresWritePassword: boolean, requiresReadPassword: boolean): Promise<void> {
  await initDatabase();
  
  const doc = await getDoc(path);
  const updatedAt = Math.floor(Date.now() / 1000);

  if (doc) {
    if (password === null) {
      await sql`UPDATE docs SET requiresPassword = ${requiresWritePassword ? 1 : 0}, requiresReadPassword = ${requiresReadPassword ? 1 : 0} WHERE path = ${path}`;
    } else {
      const hashedPassword = hashPassword(password);
      await sql`UPDATE docs SET password = ${hashedPassword}, requiresPassword = ${requiresWritePassword ? 1 : 0}, requiresReadPassword = ${requiresReadPassword ? 1 : 0} WHERE path = ${path}`;
    }
  } else {
    const hashedPassword = password ? hashPassword(password) : null;
    await sql`INSERT INTO docs (path, text, updatedAt, password, requiresPassword, requiresReadPassword) VALUES (${path}, '', ${updatedAt}, ${hashedPassword}, ${requiresWritePassword ? 1 : 0}, ${requiresReadPassword ? 1 : 0})`;
  }
}

export async function verifyDocPassword(path: string, password: string): Promise<boolean> {
  await initDatabase();
  
  const doc = await getDoc(path);
  if (!doc || !doc.password) {
    return false;
  }
  return verifyPassword(password, doc.password);
}

export async function getAllDocs(): Promise<Doc[]> {
  await initDatabase();
  
  const result = await sql`SELECT * FROM docs ORDER BY updatedAt DESC`;
  
  return result.rows.map((doc: any) => ({
    path: doc.path,
    text: doc.text || '',
    updatedAt: Number(doc.updatedat || doc.updatedAt || 0),
    password: doc.password || null,
    requiresPassword: doc.requirespassword === 1 || doc.requirespassword === true || doc.requiresPassword === 1 || doc.requiresPassword === true,
    formatType: doc.formattype || doc.formatType || 'text',
    requiresReadPassword: doc.requiresreadpassword === 1 || doc.requiresreadpassword === true || doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
    uniquePageviews: Number(doc.uniquepageviews || doc.uniquePageviews || 0),
    totalPageviews: Number(doc.totalpageviews || doc.totalPageviews || 0),
    isBlocked: doc.isblocked === 1 || doc.isblocked === true || doc.isBlocked === 1 || doc.isBlocked === true,
    blockedReason: doc.blockedreason || doc.blockedReason || null,
    blockedAt: doc.blockedat ? Number(doc.blockedat) : (doc.blockedAt ? Number(doc.blockedAt) : null),
  }));
}

export async function getDocsByPrefix(prefix: string): Promise<Doc[]> {
  await initDatabase();
  
  const prefixDepth = prefix ? (prefix.match(/\//g) || []).length : 0;
  const expectedDepth = prefixDepth + 1;

  if (!prefix) {
    const result = await sql`SELECT * FROM docs WHERE path NOT LIKE '%/%' ORDER BY path ASC`;
    
    return result.rows.map((doc: any) => ({
      path: doc.path,
      text: doc.text || '',
      updatedAt: Number(doc.updatedat || doc.updatedAt || 0),
      password: doc.password || null,
      requiresPassword: doc.requirespassword === 1 || doc.requirespassword === true || doc.requiresPassword === 1 || doc.requiresPassword === true,
      formatType: doc.formattype || doc.formatType || 'text',
      requiresReadPassword: doc.requiresreadpassword === 1 || doc.requiresreadpassword === true || doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
      uniquePageviews: Number(doc.uniquepageviews || doc.uniquePageviews || 0),
      totalPageviews: Number(doc.totalpageviews || doc.totalPageviews || 0),
      isBlocked: doc.isblocked === 1 || doc.isblocked === true || doc.isBlocked === 1 || doc.isBlocked === true,
      blockedReason: doc.blockedreason || doc.blockedReason || null,
      blockedAt: doc.blockedat ? Number(doc.blockedat) : (doc.blockedAt ? Number(doc.blockedAt) : null),
    }));
  }

  const searchPrefix = `${prefix}/`;
  const result = await sql`
    SELECT * FROM docs 
    WHERE path LIKE ${searchPrefix + '%'}
    AND path != ${prefix}
    AND (LENGTH(path) - LENGTH(REPLACE(path, '/', ''))) = ${expectedDepth}
    ORDER BY path ASC
  `;

  return result.rows.map((doc: any) => ({
    path: doc.path,
    text: doc.text || '',
    updatedAt: Number(doc.updatedat || doc.updatedAt || 0),
    password: doc.password || null,
    requiresPassword: doc.requirespassword === 1 || doc.requirespassword === true || doc.requiresPassword === 1 || doc.requiresPassword === true,
    formatType: doc.formattype || doc.formatType || 'text',
    requiresReadPassword: doc.requiresreadpassword === 1 || doc.requiresreadpassword === true || doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
    uniquePageviews: Number(doc.uniquepageviews || doc.uniquePageviews || 0),
    totalPageviews: Number(doc.totalpageviews || doc.totalPageviews || 0),
    isBlocked: doc.isblocked === 1 || doc.isblocked === true || doc.isBlocked === 1 || doc.isBlocked === true,
    blockedReason: doc.blockedreason || doc.blockedReason || null,
    blockedAt: doc.blockedat ? Number(doc.blockedat) : (doc.blockedAt ? Number(doc.blockedAt) : null),
  }));
}

export async function registerPageview(path: string, ip: string): Promise<void> {
  await initDatabase();
  
  const doc = await getDoc(path);
  if (!doc) {
    await createOrUpdateDoc(path, '');
  }
  
  const visitorResult = await sql`SELECT visitCount FROM doc_visitors WHERE path = ${path} AND ip = ${ip}`;
  const now = Math.floor(Date.now() / 1000);

  if (visitorResult.rows.length > 0) {
    await sql`UPDATE doc_visitors SET visitCount = visitCount + 1, lastVisit = ${now} WHERE path = ${path} AND ip = ${ip}`;
    await sql`UPDATE docs SET totalPageviews = totalPageviews + 1 WHERE path = ${path}`;
  } else {
    await sql`INSERT INTO doc_visitors (path, ip, firstVisit, lastVisit, visitCount) VALUES (${path}, ${ip}, ${now}, ${now}, 1)`;
    await sql`UPDATE docs SET uniquePageviews = uniquePageviews + 1, totalPageviews = totalPageviews + 1 WHERE path = ${path}`;
  }
}

export async function blockDoc(path: string, reason?: string): Promise<void> {
  await initDatabase();
  
  try {
    const doc = await getDoc(path);
    const now = Math.floor(Date.now() / 1000);

    if (doc) {
      await sql`UPDATE docs SET isBlocked = 1, blockedReason = ${reason || null}, blockedAt = ${now} WHERE path = ${path}`;
    } else {
      await sql`INSERT INTO docs (path, text, updatedAt, isBlocked, blockedReason, blockedAt) VALUES (${path}, '', ${now}, 1, ${reason || null}, ${now})`;
    }
  } catch (error) {
    throw error;
  }
}

export async function unblockDoc(path: string): Promise<void> {
  await initDatabase();
  
  const doc = await getDoc(path);
  if (doc) {
    await sql`UPDATE docs SET isBlocked = 0, blockedReason = NULL, blockedAt = NULL WHERE path = ${path}`;
  }
}

export async function isDocBlocked(path: string): Promise<boolean> {
  await initDatabase();
  
  const doc = await getDoc(path);
  return doc ? (doc.isBlocked === 1 || doc.isBlocked === true) : false;
}

