import { NextRequest, NextResponse } from 'next/server';
import { getAllDocs, blockDoc, unblockDoc } from '@/lib/db';
import { verifyToken } from '../login/route';

// Remover runtime para usar o padrão do servidor (Bun)
// export const runtime = 'nodejs';

// Verificar token de admin
function verifyAdminToken(token: string): boolean {
  return verifyToken(token);
}

// GET - Listar todos os documentos
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const docs = getAllDocs();
    
    return NextResponse.json({
      docs: docs.map(doc => ({
        path: doc.path,
        updatedAt: doc.updatedAt,
        isBlocked: doc.isBlocked === 1 || doc.isBlocked === true,
        blockedReason: doc.blockedReason,
        blockedAt: doc.blockedAt,
        uniquePageviews: doc.uniquePageviews || 0,
        totalPageviews: doc.totalPageviews || 0,
        requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
        requiresReadPassword: doc.requiresReadPassword === 1 || doc.requiresReadPassword === true,
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao listar documentos' },
      { status: 500 }
    );
  }
}

// POST - Bloquear/Desbloquear documento (usando query params)
export async function POST(request: NextRequest) {
  
  try {
    // Ler dados dos query params (workaround para custom server)
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const action = searchParams.get('action');
    const reason = searchParams.get('reason');
    

    // Verificar autenticação
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    if (!path || !action) {
      return NextResponse.json(
        { error: 'Path e action são obrigatórios' },
        { status: 400 }
      );
    }

    if (action === 'block') {
      blockDoc(path, reason || undefined);
    } else if (action === 'unblock') {
      unblockDoc(path);
    } else {
      return NextResponse.json(
        { error: 'Action inválida. Use "block" ou "unblock"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar documento' },
      { status: 500 }
    );
  }
}

