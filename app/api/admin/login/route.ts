import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Remover runtime para usar o padrão do servidor (Bun)
// export const runtime = 'nodejs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';

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

// POST - Login (usando query params para evitar bug do custom server)
export async function POST(request: NextRequest) {
  try {
    // Ler senha dos query params ao invés do body (workaround para custom server)
    const { searchParams } = new URL(request.url);
    const password = searchParams.get('password');

    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Senha incorreta' },
        { status: 401 }
      );
    }

    // Gerar token único
    const token = crypto.randomBytes(32).toString('hex');
    validTokens.set(token, { createdAt: Date.now() });

    return NextResponse.json({ token });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao fazer login: ' + error.message },
      { status: 500 }
    );
  }
}

// Exportar função para validar token
export { verifyToken as validateToken };

