import { NextRequest, NextResponse } from 'next/server';
import { getDocsByPrefix } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const path = params.slug.join('/');
    const relatedDocs = getDocsByPrefix(path);

    return NextResponse.json({
      docs: relatedDocs.map((doc) => ({
        path: doc.path,
        updatedAt: doc.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar documentos relacionados' },
      { status: 500 }
    );
  }
}

