import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Test OK' });
}

export async function POST(request: NextRequest) {
  
  try {
    const body = await request.json();
    return NextResponse.json({ message: 'Test POST OK', received: body });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao ler body' }, { status: 500 });
  }
}

