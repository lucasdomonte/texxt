import { NextRequest, NextResponse } from 'next/server';
import { getDoc, setDocPassword, verifyDocPassword, createOrUpdateDoc } from '@/lib/db';

export const runtime = 'nodejs';

// Verificar senha
export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();
    const { path, password } = body;

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: 'Path não fornecido' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Senha não fornecida' },
        { status: 400 }
      );
    }

    const isValid = verifyDocPassword(path, password);
    return NextResponse.json({ valid: isValid });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao verificar senha' },
      { status: 500 }
    );
  }
}

// Definir senha e requiresPassword
export async function PUT(
  request: NextRequest
) {
  try {
    const body = await request.json();
    const { path, password, requiresPassword, currentPassword } = body;

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: 'Path não fornecido' },
        { status: 400 }
      );
    }

    const doc = getDoc(path);
    
    // Se o documento não existe, criar primeiro
    if (!doc) {
      createOrUpdateDoc(path, '');
    }
    
    // Se já tem senha e está tentando alterar, verificar senha atual
    // Mas se password está vazio/null e requiresPassword é false, não precisa verificar
    const existingDoc = getDoc(path);
    if (existingDoc?.password && currentPassword && password) {
      // Está tentando alterar a senha, precisa verificar a atual
      if (!verifyDocPassword(path, currentPassword)) {
        return NextResponse.json(
          { error: 'Senha atual incorreta' },
          { status: 401 }
        );
      }
    }

    // Definir nova senha e requiresPassword
    setDocPassword(
      path,
      password || null,
      requiresPassword === true || requiresPassword === 1
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao definir senha' },
      { status: 500 }
    );
  }
}

