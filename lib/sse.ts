// Gerenciador de conexões SSE
type SSEClient = {
  id: string;
  path: string;
  send: (data: string) => void;
};

const clients = new Map<string, Set<SSEClient>>();

export function addSSEClient(path: string, client: SSEClient) {
  if (!clients.has(path)) {
    clients.set(path, new Set());
  }
  clients.get(path)!.add(client);
}

export function removeSSEClient(path: string, clientId: string) {
  const pathClients = clients.get(path);
  if (pathClients) {
    for (const client of pathClients) {
      if (client.id === clientId) {
        pathClients.delete(client);
        break;
      }
    }
    if (pathClients.size === 0) {
      clients.delete(path);
    }
  }
}

export function broadcastToPath(path: string, data: { text: string; updatedAt: number; formatType?: string }) {
  const pathClients = clients.get(path);
  if (pathClients) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    pathClients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        // Cliente desconectado, remover
        pathClients.delete(client);
      }
    });
  }
}

