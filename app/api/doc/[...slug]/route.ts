import { NextRequest, NextResponse } from 'next/server';
import { getDoc, createOrUpdateDoc, verifyDocPassword, setDocPassword } from '@/lib/db';
import { broadcastToPath } from '@/lib/sse';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const path = params.slug.join('/');
    const doc = getDoc(path);

    if (!doc) {
      // Criar documento vazio se não existir
      const newDoc = createOrUpdateDoc(path, '');
      const isHome = path === 'home';
      // Se for home, já definir requiresPassword
      if (isHome) {
        setDocPassword(path, null, true);
      }
      return NextResponse.json({
        text: newDoc.text,
        updatedAt: newDoc.updatedAt,
        requiresPassword: isHome,
        hasPassword: false,
        isHome,
        formatType: newDoc.formatType || 'text',
      });
    }

    const isHome = path === 'home';
    return NextResponse.json({
      text: doc.text,
      updatedAt: doc.updatedAt,
      requiresPassword: isHome || (doc.requiresPassword ? true : false),
      hasPassword: !!doc.password,
      isHome,
      formatType: doc.formatType || 'text',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar documento' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const path = params.slug.join('/');
    const body = await request.json();
    const { text, password, formatType } = body;

    if (typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Texto inválido' },
        { status: 400 }
      );
    }

    // Verificar se precisa de senha
    const currentDoc = getDoc(path);
    const isHome = path === 'home';
    const requiresPassword = isHome || (currentDoc?.requiresPassword && currentDoc.password);

    if (requiresPassword) {
      if (!password || typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Senha necessária para editar este documento', requiresPassword: true },
          { status: 401 }
        );
      }

      // Se é home e não tem senha ainda, definir a senha
      if (isHome && !currentDoc?.password) {
        setDocPassword(path, password, true);
      } else {
        // Verificar senha existente
        if (!verifyDocPassword(path, password)) {
          return NextResponse.json(
            { error: 'Senha incorreta', requiresPassword: true },
            { status: 401 }
          );
        }
      }
    }

    // Validar tamanho máximo (200 KB)
    const maxSize = 200 * 1024;
    if (Buffer.byteLength(text, 'utf8') > maxSize) {
      return NextResponse.json(
        { error: 'Documento excede o tamanho máximo de 200 KB' },
        { status: 400 }
      );
    }

    // Sanitizar: remover tags HTML para prevenir XSS
    const sanitizedText = text.replace(/<[^>]*>/g, '');

    // Validar formatType
    const validFormatTypes = ['text', 'json', 'php', 'javascript', 'markdown'];
    const finalFormatType = formatType && validFormatTypes.includes(formatType) ? formatType : undefined;

    const doc = createOrUpdateDoc(path, sanitizedText, undefined, finalFormatType);

    // Broadcast para todos os clientes SSE conectados neste path
    broadcastToPath(path, {
      text: doc.text,
      updatedAt: doc.updatedAt,
      formatType: doc.formatType || 'text',
    });

    return NextResponse.json({
      text: doc.text,
      updatedAt: doc.updatedAt,
      formatType: doc.formatType || 'text',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar documento' },
      { status: 500 }
    );
  }
}

