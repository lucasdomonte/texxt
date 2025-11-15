import crypto from 'crypto';

// Armazenar tokens em memória global (persiste entre reloads do módulo)
// @ts-ignore
if (!global.validTokens) {
  // @ts-ignore
  global.validTokens = new Map<string, { createdAt: number }>();
}
// @ts-ignore
const validTokens = global.validTokens as Map<string, { createdAt: number }>;

// Limpar tokens expirados (mais de 24h)
function cleanExpiredTokens() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas

  for (const [token, data] of validTokens.entries()) {
    if (now - data.createdAt > maxAge) {
      validTokens.delete(token);
    }
  }
}

// Verificar se token é válido
export function verifyToken(token: string): boolean {
  cleanExpiredTokens();
  return validTokens.has(token);
}

// Gerar token único
export function generateToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.set(token, { createdAt: Date.now() });
  return token;
}

