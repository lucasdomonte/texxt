import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../login/route';
import { getDoc, verifyDocPassword, setDocAccess } from '@/lib/db';

// Remover runtime para usar o padrão do servidor (Bun)
// export const runtime = 'nodejs';

// POST - Trocar senha de um documento
export async function POST(request: NextRequest) {
  
  try {
    // Ler dados dos query params (workaround para custom server)
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const currentPassword = searchParams.get('currentPassword');
    const newPassword = searchParams.get('newPassword');
    

    // Verificar autenticação do admin
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    if (!path || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Path, senha atual e nova senha são obrigatórios' },
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

    // Verificar senha atual
    if (!verifyDocPassword(path, currentPassword)) {
      return NextResponse.json(
        { error: 'Senha atual incorreta' },
        { status: 401 }
      );
    }

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

