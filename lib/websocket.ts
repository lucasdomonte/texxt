// Gerenciador de conexões WebSocket
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getDoc, createOrUpdateDoc, verifyDocPassword, setDocPassword, getDocsByPrefix, setDocAccess, registerPageview, isDocBlocked } from '@/lib/db';

let io: SocketIOServer | null = null;

export function initWebSocket(server: HTTPServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {

    // Cliente solicita carregar um documento
    socket.on('load-doc', async (data: { path: string }) => {
      try {
        const { path } = data;
        
        // Verificar se o documento está bloqueado
        if (isDocBlocked(path)) {
          const doc = getDoc(path);
          socket.emit('doc-blocked', {
            message: 'Este documento foi bloqueado pelo administrador',
            reason: doc?.blockedReason || null,
            blockedAt: doc?.blockedAt || null,
          });
          return;
        }
        
        let doc = getDoc(path);

        if (!doc) {
          // Criar documento vazio se não existir
          doc = createOrUpdateDoc(path, '');
          const isHome = path === 'home';
          if (isHome) {
            setDocPassword(path, null, true);
          }
        }

        // Registrar pageview
        const clientIp = socket.handshake.headers['x-forwarded-for'] as string || 
                         socket.handshake.headers['x-real-ip'] as string ||
                         socket.handshake.address;
        const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();
        registerPageview(path, ip);

        const isHome = path === 'home';
        const requiresRead = (doc as any).requiresReadPassword ? true : false;
        const hasPwd = !!doc.password;
        const locked = requiresRead && hasPwd;
        
        // Buscar documento atualizado com pageviews
        doc = getDoc(path)!;
        
        socket.emit('doc-loaded', {
          text: locked ? '' : doc.text,
          updatedAt: doc.updatedAt,
          requiresPassword: isHome || (doc.requiresPassword ? true : false),
          requiresReadPassword: requiresRead,
          hasPassword: hasPwd,
          isHome,
          locked,
          formatType: doc.formatType || 'text',
          uniquePageviews: doc.uniquePageviews || 0,
          totalPageviews: doc.totalPageviews || 0,
        });

        // Entrar na sala do documento para receber atualizações
        socket.join(`doc:${path}`);
      } catch (error) {
        socket.emit('error', { message: 'Erro ao carregar documento' });
      }
    });

    // Cliente solicita salvar um documento
    socket.on('save-doc', async (data: { path: string; text: string; password?: string; formatType?: string }) => {
      try {
        const { path, text, password, formatType } = data;

        if (typeof text !== 'string') {
          socket.emit('save-error', { error: 'Texto inválido' });
          return;
        }

        // Verificar se precisa de senha
        const currentDoc = getDoc(path);
        const isHome = path === 'home';
        const requiresPassword = isHome || (currentDoc?.requiresPassword && currentDoc.password);
        const requiresReadPassword = currentDoc ? ((currentDoc as any)?.requiresReadPassword && currentDoc.password) : false;

        if (requiresPassword) {
          if (!password || typeof password !== 'string') {
            socket.emit('save-error', {
              error: 'Senha necessária para editar este documento',
              requiresPassword: true,
            });
            return;
          }

          // Se é home e não tem senha ainda, definir a senha
          if (isHome && !currentDoc?.password) {
            setDocPassword(path, password, true);
          } else {
            // Verificar senha existente
            if (!verifyDocPassword(path, password)) {
              socket.emit('save-error', {
                error: 'Senha incorreta',
                requiresPassword: true,
              });
              return;
            }
          }
        }

        // Validar tamanho máximo (200 KB)
        const maxSize = 200 * 1024;
        if (Buffer.byteLength(text, 'utf8') > maxSize) {
          socket.emit('save-error', {
            error: 'Documento excede o tamanho máximo de 200 KB',
          });
          return;
        }

        // Sanitizar: remover tags HTML para prevenir XSS
        const sanitizedText = text.replace(/<[^>]*>/g, '');

        // Validar formatType
        const validFormatTypes = ['text', 'json', 'php', 'javascript', 'markdown'];
        const finalFormatType = formatType && validFormatTypes.includes(formatType) ? formatType : undefined;

        const doc = createOrUpdateDoc(path, sanitizedText, undefined, finalFormatType);

        // Broadcast para todos os clientes conectados neste path
        io!.to(`doc:${path}`).emit('doc-updated', {
          text: doc.text,
          updatedAt: doc.updatedAt,
          formatType: doc.formatType || 'text',
        });

        socket.emit('doc-saved', {
          text: doc.text,
          updatedAt: doc.updatedAt,
          formatType: doc.formatType || 'text',
        });
      } catch (error: any) {
        socket.emit('save-error', {
          error: error.message || 'Erro ao salvar documento',
        });
      }
    });

    // Cliente solicita documentos relacionados
    socket.on('load-related', async (data: { path: string }) => {
      try {
        const { path } = data;
        const docs = getDocsByPrefix(path);
        socket.emit('related-loaded', {
          docs: docs.map((doc) => ({
            path: doc.path,
            updatedAt: doc.updatedAt,
          })),
        });
      } catch (error) {
        socket.emit('error', { message: 'Erro ao carregar documentos relacionados' });
      }
    });

    // Desbloquear leitura
    socket.on('unlock-read', async (data: { path: string; password: string }) => {
      try {
        const { path, password } = data;
        const doc = getDoc(path);
        if (!doc) {
          socket.emit('error', { message: 'Documento não encontrado' });
          return;
        }
        const requiresRead = (doc as any).requiresReadPassword && doc.password;
        if (!requiresRead) {
          // Nada a desbloquear
          socket.emit('doc-loaded', {
            text: doc.text,
            updatedAt: doc.updatedAt,
            requiresPassword: !!doc.requiresPassword,
            requiresReadPassword: !!(doc as any).requiresReadPassword,
            hasPassword: !!doc.password,
            isHome: path === 'home',
            locked: false,
            formatType: doc.formatType || 'text',
          });
          return;
        }
        if (!verifyDocPassword(path, password)) {
          socket.emit('unlock-error', { error: 'Senha incorreta' });
          return;
        }
        socket.emit('doc-loaded', {
          text: doc.text,
          updatedAt: doc.updatedAt,
          requiresPassword: !!doc.requiresPassword,
          requiresReadPassword: !!(doc as any).requiresReadPassword,
          hasPassword: !!doc.password,
          isHome: path === 'home',
          locked: false,
          formatType: doc.formatType || 'text',
        });
      } catch (error) {
        socket.emit('unlock-error', { error: 'Erro ao desbloquear leitura' });
      }
    });

    // Atualizar configuração de senha/leituras
    socket.on('update-password-extended', async (data: { path: string; password: string | null; requiresPassword: boolean; requiresReadPassword: boolean; currentPassword?: string }) => {
      try {
        const { path, password, requiresPassword, requiresReadPassword, currentPassword } = data;
        const doc = getDoc(path);
        if (!doc) {
          createOrUpdateDoc(path, '');
        }
        const existingDoc = getDoc(path);
        if (existingDoc?.password && currentPassword && password) {
          if (!verifyDocPassword(path, currentPassword)) {
            socket.emit('password-update-error', { error: 'Senha atual incorreta' });
            return;
          }
        }
        setDocAccess(path, password || null, !!requiresPassword, !!requiresReadPassword);
        socket.emit('password-updated', { success: true });
      } catch (error: any) {
        socket.emit('password-update-error', { error: error.message || 'Erro ao atualizar configuração' });
      }
    });

    // Verificar senha
    socket.on('verify-password', async (data: { path: string; password: string }) => {
      try {
        const { path, password } = data;
        const isValid = verifyDocPassword(path, password);
        socket.emit('password-verified', { valid: isValid });
      } catch (error) {
        socket.emit('error', { message: 'Erro ao verificar senha' });
      }
    });

    // Atualizar configuração de senha
    socket.on('update-password', async (data: { path: string; password: string | null; requiresPassword: boolean; currentPassword?: string }) => {
      try {
        const { path, password, requiresPassword, currentPassword } = data;

        const doc = getDoc(path);

        // Se o documento não existe, criar
        if (!doc) {
          createOrUpdateDoc(path, '');
        }

        // Se já tem senha e está tentando mudar, verificar senha atual
        const existingDoc = getDoc(path);
        if (existingDoc?.password && currentPassword && password) {
          if (!verifyDocPassword(path, currentPassword)) {
            socket.emit('password-update-error', { error: 'Senha atual incorreta' });
            return;
          }
        }

        // Atualizar senha e requiresPassword
        setDocPassword(path, password || null, requiresPassword);
        socket.emit('password-updated', { success: true });
      } catch (error: any) {
        socket.emit('password-update-error', { error: error.message || 'Erro ao atualizar senha' });
      }
    });

    // Cliente desconecta
    socket.on('disconnect', () => {
    });
  });

  return io;
}

export function getIO() {
  return io;
}

