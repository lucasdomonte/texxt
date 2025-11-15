// Sistema de rastreamento de usuários ativos por documento
type ActiveUser = {
  id: string;
  path: string;
  lastSeen: number;
};

// Map de path -> Set de usuários ativos
const activeUsersByPath = new Map<string, Set<ActiveUser>>();

// Limpar usuários inativos (não visto há mais de 45 segundos)
// Tempo maior para não remover usuários que apenas mudaram de aba
const INACTIVE_THRESHOLD = 45000; // 45 segundos

function cleanupInactiveUsers() {
  const now = Date.now();
  for (const [path, users] of activeUsersByPath.entries()) {
    for (const user of users) {
      if (now - user.lastSeen > INACTIVE_THRESHOLD) {
        users.delete(user);
      }
    }
    if (users.size === 0) {
      activeUsersByPath.delete(path);
    }
  }
}

// Registrar usuário ativo
export function registerActiveUser(path: string, userId: string): number {
  cleanupInactiveUsers();
  
  if (!activeUsersByPath.has(path)) {
    activeUsersByPath.set(path, new Set());
  }
  
  const users = activeUsersByPath.get(path)!;
  
  // Atualizar ou adicionar usuário
  for (const user of users) {
    if (user.id === userId) {
      user.lastSeen = Date.now();
      return users.size;
    }
  }
  
  // Novo usuário
  users.add({
    id: userId,
    path,
    lastSeen: Date.now(),
  });
  
  return users.size;
}

// Remover usuário
export function unregisterActiveUser(path: string, userId: string): number {
  const users = activeUsersByPath.get(path);
  if (!users) return 0;
  
  for (const user of users) {
    if (user.id === userId) {
      users.delete(user);
      break;
    }
  }
  
  if (users.size === 0) {
    activeUsersByPath.delete(path);
  }
  
  return users.size;
}

// Obter número de usuários ativos
export function getActiveUserCount(path: string): number {
  cleanupInactiveUsers();
  return activeUsersByPath.get(path)?.size || 0;
}

