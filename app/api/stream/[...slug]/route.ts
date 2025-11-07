import { NextRequest } from 'next/server';
import { addSSEClient, removeSSEClient } from '@/lib/sse';
import { getDoc } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const path = params.slug.join('/');
  const clientId = `${Date.now()}-${Math.random()}`;

  // Criar stream SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Enviar header SSE
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      // Enviar dados iniciais
      const doc = getDoc(path);
      if (doc) {
        send(`data: ${JSON.stringify({ text: doc.text, updatedAt: doc.updatedAt, formatType: doc.formatType || 'text' })}\n\n`);
      }

      // Registrar cliente
      addSSEClient(path, {
        id: clientId,
        path,
        send,
      });

      // Manter conexão viva com heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          send(': heartbeat\n\n');
        } catch (error) {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // A cada 30 segundos

      // Cleanup quando cliente desconectar
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        removeSSEClient(path, clientId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

