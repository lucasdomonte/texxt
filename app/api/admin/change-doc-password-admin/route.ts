import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../login/route';
import { getDoc, setDocAccess } from '@/lib/db';

// Remover runtime para usar o padrão do servidor (Bun)
// export const runtime = 'nodejs';

// POST - Trocar senha de um documento (admin não precisa da senha atual)
export async function POST(request: NextRequest) {
  
  try {
    // Ler dados dos query params (workaround para custom server)
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const newPassword = searchParams.get('newPassword');
    

    // Verificar autenticação do admin
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    
    const isValid = verifyToken(token || '');
    
    if (!token || !isValid) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    if (!path || !newPassword) {
      return NextResponse.json(
        { error: 'Path e nova senha são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se o documento existe
    const doc = getDoc(path);
    if (!doc) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se tem senha
    if (!doc.password) {
      return NextResponse.json(
        { error: 'Este documento não tem senha configurada' },
        { status: 400 }
      );
    }

    // Admin pode trocar sem verificar senha atual
    // Atualizar com a nova senha, mantendo as configurações atuais
    const requiresWrite = doc.requiresPassword === 1 || doc.requiresPassword === true;
    const requiresRead = (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true;
    
    setDocAccess(path, newPassword, requiresWrite, requiresRead);

    
    return NextResponse.json({ 
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao trocar senha' },
      { status: 500 }
    );
  }
}

