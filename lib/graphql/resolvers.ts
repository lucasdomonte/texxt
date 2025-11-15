import {
  getDoc,
  createOrUpdateDoc,
  verifyDocPassword,
  setDocPassword,
  setDocAccess,
  getDocsByPrefix,
  getAllDocs,
  blockDoc,
  unblockDoc,
  isDocBlocked,
  registerPageview,
  createDocSession,
  verifyDocSession,
  invalidateDocSessions,
} from '@/lib/db';
import { verifyToken, generateToken } from '@/lib/auth';
import { PubSub } from 'graphql-subscriptions';
import { registerActiveUser, unregisterActiveUser, getActiveUserCount } from '@/lib/active-users';
import crypto from 'crypto';

const pubsub = new PubSub();

// Helper para obter IP do request
function getClientIp(request: any): string {
  const forwarded = request?.headers?.['x-forwarded-for'];
  const realIp = request?.headers?.['x-real-ip'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp.split(',')[0].trim();
  }
  return 'unknown';
}

// Helper para verificar autenticação admin
function verifyAdminToken(context: any): boolean {
  const token = context?.req?.headers?.authorization?.replace('Bearer ', '');
  return token ? verifyToken(token) : false;
}

export const resolvers = {
  Query: {
    doc: async (_: any, { path }: { path: string }, context: any) => {
      // Verificar se está bloqueado
      const blocked = await isDocBlocked(path);
      if (blocked) {
        const doc = await getDoc(path);
        return {
          path,
          text: '',
          updatedAt: doc?.updatedAt || Date.now(),
          requiresPassword: false,
          requiresReadPassword: false,
          hasPassword: false,
          isHome: path === 'home',
          formatType: 'text',
          locked: false,
          isBlocked: true,
          blockedReason: doc?.blockedReason || null,
          blockedAt: doc?.blockedAt || null,
        };
      }

      const doc = await getDoc(path);

      if (!doc) {
        // Criar documento vazio se não existir
        const newDoc = await createOrUpdateDoc(path, '');
        const isHome = path === 'home';
        if (isHome) {
          await setDocPassword(path, null, true);
        }
        return {
          path,
          text: newDoc.text,
          updatedAt: newDoc.updatedAt,
          requiresPassword: isHome,
          requiresReadPassword: false,
          hasPassword: false,
          isHome,
          formatType: newDoc.formatType || 'text',
          locked: false,
          isBlocked: false,
        };
      }

      const isHome = path === 'home';
      const requiresRead = !!(doc as any).requiresReadPassword && !!doc.password;
      
      // Verificar token de sessão se o documento requer senha de leitura
      let locked = Boolean(requiresRead);
      if (requiresRead) {
        // Next.js pode passar headers em lowercase ou como objeto
        const headers = context?.req?.headers || {};
        const userId = headers['x-user-id'] || headers['X-User-Id'] || '';
        const token = headers['x-doc-token'] || headers['X-Doc-Token'] || '';
        
        if (userId && token) {
          try {
            const hasValidSession = await verifyDocSession(path, userId, token);
            if (hasValidSession) {
              locked = false; // Token válido, desbloquear
            }
          } catch (error) {
            // Se houver erro na verificação, manter bloqueado
            console.error('Erro ao verificar sessão:', error);
          }
        }
      }

      // Registrar pageview (não bloquear se falhar)
      try {
        const ip = getClientIp(context?.req);
        await registerPageview(path, ip);
      } catch (error) {
        // Ignorar erros de pageview para não bloquear o carregamento do documento
      }

      // Garantir que todos os campos booleanos são realmente booleanos
      const requiresPasswordValue = doc.requiresPassword;
      const requiresPasswordBool = isHome || (
        requiresPasswordValue === true || 
        requiresPasswordValue === 1 || 
        (typeof requiresPasswordValue === 'number' && requiresPasswordValue !== 0)
      );
      
      const requiresReadPasswordValue = (doc as any).requiresReadPassword;
      const requiresReadPasswordBool = (
        requiresReadPasswordValue === true || 
        requiresReadPasswordValue === 1 || 
        (typeof requiresReadPasswordValue === 'number' && requiresReadPasswordValue !== 0)
      );
      
      const hasPasswordBool = !!(doc.password && typeof doc.password === 'string' && doc.password.length > 0);
      
      return {
        path,
        text: locked ? '' : doc.text,
        updatedAt: doc.updatedAt,
        requiresPassword: Boolean(requiresPasswordBool),
        requiresReadPassword: Boolean(requiresReadPasswordBool),
        hasPassword: Boolean(hasPasswordBool),
        isHome,
        formatType: doc.formatType || 'text',
        locked: Boolean(locked),
        isBlocked: false,
        sessionToken: null, // Não retornar token na query, apenas na mutation unlockDoc
      };
    },

    relatedDocs: async (_: any, { path }: { path: string }) => {
      const relatedDocs = await getDocsByPrefix(path);
      
      // Filtrar documentos bloqueados e protegidos por senha por segurança
      // Não expor a existência de documentos protegidos ou bloqueados
      const filteredDocs = relatedDocs.filter((doc) => {
        // Não retornar documentos bloqueados
        if (doc.isBlocked) {
          return false;
        }
        
        // Não retornar documentos protegidos por senha de leitura
        // (para não expor que existem documentos protegidos)
        if ((doc as any).requiresReadPassword && doc.password) {
          return false;
        }
        
        return true;
      });
      
      return filteredDocs.map((doc) => ({
        path: doc.path,
        updatedAt: doc.updatedAt,
      }));
    },

    adminDocs: async (_: any, __: any, context: any) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      const docs = await getAllDocs();
      return docs.map((doc) => ({
        path: doc.path,
        updatedAt: doc.updatedAt,
        isBlocked: doc.isBlocked === 1 || doc.isBlocked === true,
        blockedReason: doc.blockedReason,
        blockedAt: doc.blockedAt,
        uniquePageviews: doc.uniquePageviews || 0,
        totalPageviews: doc.totalPageviews || 0,
        requiresPassword: doc.requiresPassword === 1 || doc.requiresPassword === true,
        requiresReadPassword: (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true,
      }));
    },

    activeUserCount: async (_: any, { path }: { path: string }) => {
      return getActiveUserCount(path);
    },
  },

  Mutation: {
    saveDoc: async (
      _: any,
      { path, text, password, formatType }: { path: string; text: string; password?: string; formatType?: string },
      context: any
    ) => {
      if (typeof text !== 'string') {
        throw new Error('Texto inválido');
      }

      // Verificar se precisa de senha
      const currentDoc = await getDoc(path);
      const isHome = path === 'home';
      const requiresPassword = isHome || (currentDoc?.requiresPassword && currentDoc.password);

      if (requiresPassword) {
        if (!password || typeof password !== 'string') {
          throw new Error('Senha necessária para editar este documento');
        }

        // Se é home e não tem senha ainda, definir a senha
        if (isHome && !currentDoc?.password) {
          await setDocPassword(path, password, true);
        } else {
          // Verificar senha existente
          if (!(await verifyDocPassword(path, password))) {
            throw new Error('Senha incorreta');
          }
        }
      }

      // Validar tamanho máximo (200 KB)
      const maxSize = 200 * 1024;
      if (Buffer.byteLength(text, 'utf8') > maxSize) {
        throw new Error('Documento excede o tamanho máximo de 200 KB');
      }

      // Sanitizar: remover tags HTML para prevenir XSS
      const sanitizedText = text.replace(/<[^>]*>/g, '');

      // Validar formatType
      const validFormatTypes = ['text', 'json', 'php', 'javascript', 'markdown'];
      const finalFormatType = formatType && validFormatTypes.includes(formatType) ? formatType : undefined;

      const doc = await createOrUpdateDoc(path, sanitizedText, undefined, finalFormatType);

      // Calcular locked corretamente (sempre booleano)
      const requiresReadForSub = !!(doc as any).requiresReadPassword && !!doc.password;
      const lockedForSub = Boolean(requiresReadForSub);
      
      // Publicar atualização via subscription
      const subscriptionData = {
        path,
        text: doc.text,
        updatedAt: doc.updatedAt,
        requiresPassword: Boolean(isHome || (doc.requiresPassword ? true : false)),
        requiresReadPassword: Boolean((doc as any).requiresReadPassword ? true : false),
        hasPassword: Boolean(!!doc.password),
        isHome,
        formatType: doc.formatType || 'text',
        locked: Boolean(lockedForSub), // Garantir que seja sempre booleano
        isBlocked: false,
      };
      
      pubsub.publish(`DOC_UPDATED_${path}`, {
        docUpdated: subscriptionData,
      });

      return {
        path,
        text: doc.text,
        updatedAt: doc.updatedAt,
        requiresPassword: Boolean(isHome || (doc.requiresPassword ? true : false)),
        requiresReadPassword: Boolean((doc as any).requiresReadPassword ? true : false),
        hasPassword: Boolean(!!doc.password),
        isHome,
        formatType: doc.formatType || 'text',
        locked: false,
        isBlocked: false,
        sessionToken: null,
      };
    },

    unlockDoc: async (_: any, { path, password, userId }: { path: string; password: string; userId: string }, context: any) => {
      const doc = await getDoc(path);
      if (!doc) {
        throw new Error('Documento não encontrado');
      }

      // Garantir que requiresRead seja sempre booleano, não pode ser string (hash)
      const requiresRead = !!(doc as any).requiresReadPassword && !!doc.password;
      if (!requiresRead) {
        return {
          path,
          text: doc.text,
          updatedAt: doc.updatedAt,
          requiresPassword: Boolean(!!doc.requiresPassword),
          requiresReadPassword: Boolean(!!(doc as any).requiresReadPassword),
          hasPassword: Boolean(!!doc.password),
          isHome: path === 'home',
          locked: Boolean(false),
          formatType: doc.formatType || 'text',
          isBlocked: false,
        };
      }

      if (!(await verifyDocPassword(path, password))) {
        throw new Error('Senha incorreta');
      }

      // Gerar token de sessão após validação bem-sucedida
      const token = crypto.randomBytes(32).toString('hex');
      await createDocSession(path, userId, token);

      return {
        path,
        text: doc.text,
        updatedAt: doc.updatedAt,
        requiresPassword: Boolean(!!doc.requiresPassword),
        requiresReadPassword: Boolean(!!(doc as any).requiresReadPassword),
        hasPassword: Boolean(!!doc.password),
        isHome: path === 'home',
        locked: Boolean(false),
        formatType: doc.formatType || 'text',
        isBlocked: false,
        sessionToken: token, // Retornar token para o frontend
      };
    },

    setDocAccess: async (
      _: any,
      {
        path,
        password,
        requiresPassword,
        requiresReadPassword,
        currentPassword,
      }: {
        path: string;
        password?: string;
        requiresPassword: boolean;
        requiresReadPassword: boolean;
        currentPassword?: string;
      }
    ) => {
      const doc = await getDoc(path);

      // Se o documento não existe, criar primeiro
      if (!doc) {
        await createOrUpdateDoc(path, '');
      }

      // Se já tem senha e está tentando alterar, verificar senha atual
      const existingDoc = await getDoc(path);
      if (existingDoc?.password && currentPassword && password) {
        if (!(await verifyDocPassword(path, currentPassword))) {
          throw new Error('Senha atual incorreta');
        }
      }

      // Atualizar configuração de acesso
      await setDocAccess(path, password || null, requiresPassword, requiresReadPassword);

      // Se a senha foi alterada, invalidar todas as sessões existentes
      if (password !== null && password !== undefined) {
        await invalidateDocSessions(path);
      }

      return true;
    },

    adminLogin: async (_: any, { password }: { password: string }) => {
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

      if (!ADMIN_PASSWORD) {
        throw new Error('ADMIN_PASSWORD não configurado');
      }

      if (password !== ADMIN_PASSWORD) {
        throw new Error('Senha incorreta');
      }

      // Gerar token único
      const token = generateToken();
      return token;
    },

    adminChangePassword: async (
      _: any,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      context: any
    ) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

      if (!ADMIN_PASSWORD) {
        throw new Error('ADMIN_PASSWORD não configurado');
      }

      if (currentPassword !== ADMIN_PASSWORD) {
        throw new Error('Senha atual incorreta');
      }

      // Em produção, você deve atualizar o .env ou banco de dados
      return true;
    },

    adminChangeDocPassword: async (
      _: any,
      { path, currentPassword, newPassword }: { path: string; currentPassword: string; newPassword: string },
      context: any
    ) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      const doc = await getDoc(path);
      if (!doc) {
        throw new Error('Documento não encontrado');
      }

      if (!doc.password) {
        throw new Error('Este documento não tem senha configurada');
      }

      if (!(await verifyDocPassword(path, currentPassword))) {
        throw new Error('Senha atual incorreta');
      }

      const requiresWrite = doc.requiresPassword === 1 || doc.requiresPassword === true;
      const requiresRead = (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true;

      await setDocAccess(path, newPassword, requiresWrite, requiresRead);

      return true;
    },

    adminChangeDocPasswordAdmin: async (
      _: any,
      { path, newPassword }: { path: string; newPassword: string },
      context: any
    ) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      const doc = await getDoc(path);
      if (!doc) {
        throw new Error('Documento não encontrado');
      }

      if (!doc.password) {
        throw new Error('Este documento não tem senha configurada');
      }

      const requiresWrite = doc.requiresPassword === 1 || doc.requiresPassword === true;
      const requiresRead = (doc as any).requiresReadPassword === 1 || (doc as any).requiresReadPassword === true;

      await setDocAccess(path, newPassword, requiresWrite, requiresRead);

      return true;
    },

    adminBlockDoc: async (
      _: any,
      { path, reason }: { path: string; reason?: string },
      context: any
    ) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      await blockDoc(path, reason);
      return true;
    },

    adminUnblockDoc: async (_: any, { path }: { path: string }, context: any) => {
      if (!verifyAdminToken(context)) {
        throw new Error('Não autorizado');
      }

      await unblockDoc(path);
      return true;
    },

    registerActiveUser: async (_: any, { path, userId }: { path: string; userId: string }) => {
      return registerActiveUser(path, userId);
    },

    unregisterActiveUser: async (_: any, { path, userId }: { path: string; userId: string }) => {
      return unregisterActiveUser(path, userId);
    },
  },

  Subscription: {
    docUpdated: {
      subscribe: (_: any, { path }: { path: string }) => {
        // @ts-ignore - asyncIterator existe em runtime, mas TypeScript não reconhece
        return pubsub.asyncIterator([`DOC_UPDATED_${path}`]);
      },
    },
  },
};

