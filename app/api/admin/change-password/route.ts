import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../login/route';

// Remover runtime para usar o padrão do servidor (Bun)
// export const runtime = 'nodejs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';

// POST - Trocar senha do admin
export async function POST(request: NextRequest) {
  
  try {
    // Ler dados dos query params (workaround para custom server)
    const { searchParams } = new URL(request.url);
    const currentPassword = searchParams.get('currentPassword');
    const newPassword = searchParams.get('newPassword');
    

    // Verificar autenticação
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Senha atual e nova senha são obrigatórias' },
        { status: 400 }
      );
    }

    // Verificar senha atual
    if (currentPassword !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Senha atual incorreta' },
        { status: 401 }
      );
    }

    // Em produção, você deve atualizar o .env ou banco de dados
    // Por enquanto, apenas retornamos sucesso
    
    return NextResponse.json({ 
      success: true,
      message: 'Para alterar a senha permanentemente, atualize a variável ADMIN_PASSWORD no arquivo .env.local'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao trocar senha' },
      { status: 500 }
    );
  }
}

