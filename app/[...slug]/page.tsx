'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@apollo/client/react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { php } from '@codemirror/lang-php';
import { markdown } from '@codemirror/lang-markdown';
import {
  GET_DOC,
  GET_RELATED_DOCS,
  SAVE_DOC,
  UNLOCK_DOC,
  SET_DOC_ACCESS,
  GET_ACTIVE_USER_COUNT,
  REGISTER_ACTIVE_USER,
  UNREGISTER_ACTIVE_USER,
} from '@/lib/graphql/queries';

interface RelatedDoc {
  path: string;
  updatedAt: number;
}

export default function DocPage() {
  const pathname = usePathname();
  const router = useRouter();
  const slug = pathname === '/' ? 'home' : pathname.slice(1);
  const parentPath = useMemo(() => {
    if (!slug || slug === 'home') return null;
    const idx = slug.lastIndexOf('/');
    if (idx <= 0) return null;
    return slug.substring(0, idx);
  }, [slug]);

  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'waiting_password' | 'not_saved'>('idle');
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [unlockPasswordError, setUnlockPasswordError] = useState('');
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'save' | 'unlock_read' | 'config_access' | null>(null);
  const [requiresPasswordCheckbox, setRequiresPasswordCheckbox] = useState(false);
  const [requiresReadCheckbox, setRequiresReadCheckbox] = useState(false);
  const [formatType, setFormatType] = useState<'text' | 'json' | 'php' | 'javascript' | 'markdown'>('text');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requiresReadPassword, setRequiresReadPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isReadLocked, setIsReadLocked] = useState(false);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const unlockPasswordInputRef = useRef<HTMLInputElement>(null);
  const formatTypeRef = useRef<'text' | 'json' | 'php' | 'javascript' | 'markdown'>('text');
  const showPasswordModalRef = useRef(false);
  const lastSavedRef = useRef<number | null>(null);
  const isSavingRef = useRef(false); // Flag para indicar que estamos salvando
  const pendingSaveTextRef = useRef<string | null>(null); // Texto que está sendo salvo
  
  // Gerar ou recuperar ID único do usuário do localStorage
  const getUserId = useCallback(() => {
    if (typeof window === 'undefined') return `temp-${Date.now()}-${Math.random()}`;
    
    const storageKey = 'texxt_user_id';
    let userId = localStorage.getItem(storageKey);
    
    if (!userId) {
      // Gerar novo ID único
      userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem(storageKey, userId);
    }
    
    return userId;
  }, []);
  
  const userIdRef = useRef<string>(getUserId());

  // GraphQL Query para carregar documento (com polling otimizado)
  const { data: docData, loading: docLoading, error: docError, refetch: refetchDoc } = useQuery(GET_DOC, {
    variables: { path: slug },
    skip: false,
    pollInterval: 5000, // Poll a cada 5s para atualizações em tempo real
    notifyOnNetworkStatusChange: false, // Evita re-renders quando apenas o status da rede muda
    fetchPolicy: 'cache-and-network', // Usa cache primeiro, depois atualiza
  });

  // Processar dados quando recebidos (evitar re-renders desnecessários)
  const doc = (docData as any)?.doc;
  const docUpdatedAt = doc?.updatedAt;
  const docText = doc?.text;
  
  const isBlocked = doc?.isBlocked || false;
  const blockedReason = doc?.blockedReason || null;
  const isHome = doc?.isHome || false;

  // GraphQL Query para documentos relacionados
  const { data: relatedDocsData, refetch: refetchRelatedDocs, loading: relatedDocsLoading } = useQuery(GET_RELATED_DOCS, {
    variables: { path: slug },
    skip: isBlocked, // Não buscar apenas se bloqueado (isReadLocked será verificado no useEffect)
    fetchPolicy: 'cache-and-network',
  });

  // GraphQL Mutations para registrar/desregistrar usuário
  const [registerUserMutation] = useMutation(REGISTER_ACTIVE_USER);
  const [unregisterUserMutation] = useMutation(UNREGISTER_ACTIVE_USER);

  // GraphQL Query para contagem de usuários ativos (depois de isBlocked estar definido)
  const { data: activeUserData } = useQuery(GET_ACTIVE_USER_COUNT, {
    variables: { path: slug },
    skip: isBlocked,
    pollInterval: 3000, // Poll a cada 3s para atualizar contagem
    notifyOnNetworkStatusChange: false,
  });
  
  useEffect(() => {
    if (!doc || doc.isBlocked) return;
    
    const currentText = doc.text || '';
    
    // Se estamos salvando, não atualizar o texto do servidor ainda
    // Isso evita que o texto desapareça durante o salvamento
    if (isSavingRef.current && pendingSaveTextRef.current !== null) {
      // Verificar se o servidor já processou nosso salvamento
      const serverTimestamp = docUpdatedAt || 0;
      const lastKnownSave = lastSavedRef.current || 0;
      
      // Se o servidor ainda não atualizou (timestamp igual ou anterior), manter nosso texto local
      if (serverTimestamp <= lastKnownSave) {
        return; // Não atualizar ainda, manter texto local
      }
      
      // Se o servidor já atualizou, verificar se o texto bate com o que salvamos
      const serverText = doc.text || '';
      if (serverText === pendingSaveTextRef.current || serverText === text) {
        // Servidor confirmou nosso save, podemos atualizar
        isSavingRef.current = false;
        pendingSaveTextRef.current = null;
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
        lastSavedRef.current = docUpdatedAt;
        return;
      } else {
        // Servidor tem texto diferente, pode ser de outro usuário
        // Mas se estamos salvando, esperar um pouco mais antes de sobrescrever
        return;
      }
    }
    
    // Se é a nossa própria edição recente ou os dados não mudaram, não fazer nada
    if (docUpdatedAt === lastSavedRef.current) {
      return;
    }
    
    // Comparar se realmente houve mudança no conteúdo antes de atualizar
    const hasTextChanged = currentText !== savedText;
    const newRequiresPassword = doc.requiresPassword || false;
    const newRequiresReadPassword = doc.requiresReadPassword || false;
    const newLocked = !!doc.locked;
    const newFormatType = (doc.formatType as 'text' | 'json' | 'php' | 'javascript' | 'markdown') || 'text';
    
    // Só atualizar estados se realmente mudaram (evita re-renders desnecessários)
    // Mas não atualizar texto se estamos salvando
    if (hasTextChanged && !isSavingRef.current) {
      setText(currentText);
      setSavedText(currentText);
    }
    
    if (newRequiresPassword !== requiresPasswordCheckbox) {
      setRequiresPasswordCheckbox(newRequiresPassword);
    }
    if (newRequiresReadPassword !== requiresReadCheckbox) {
      setRequiresReadCheckbox(newRequiresReadPassword);
    }
    if (newLocked !== isReadLocked) {
      setIsReadLocked(newLocked);
      if (!newLocked && isReadLocked) {
        refetchRelatedDocs();
      }
    }
    if (newFormatType !== formatTypeRef.current) {
      setFormatType(newFormatType);
      formatTypeRef.current = newFormatType;
    }
    
    // Atualizar timestamp apenas se realmente processou mudanças
    if (!isSavingRef.current) {
      lastSavedRef.current = docUpdatedAt;
    }
  }, [docUpdatedAt, docText, savedText, requiresPasswordCheckbox, requiresReadCheckbox, isReadLocked, refetchRelatedDocs, text]);

  // Sincronizar estados do documento
  useEffect(() => {
    if (doc) {
      setRequiresPassword(doc.requiresPassword || false);
      setRequiresReadPassword(doc.requiresReadPassword || false);
      setHasPassword(doc.hasPassword || false);
      setIsReadLocked(doc.locked || false);
    }
  }, [doc]);

  // Processar documentos relacionados quando recebidos
  useEffect(() => {
    // Não processar se bloqueado ou travado para leitura
    if (isBlocked || isReadLocked) {
      setRelatedDocs([]);
      return;
    }
    
    if (relatedDocsData && (relatedDocsData as any)?.relatedDocs) {
      const docs = (relatedDocsData as any).relatedDocs;
      setRelatedDocs(Array.isArray(docs) ? docs : []);
    } else if (!relatedDocsLoading) {
      // Se não há dados e não está carregando, pode ser que não existam documentos relacionados
      setRelatedDocs([]);
    }
  }, [relatedDocsData, relatedDocsLoading, isBlocked, isReadLocked]);

  // Polling já está configurado no useQuery acima

  // GraphQL Mutation para salvar documento
  const [saveDocMutation] = useMutation(SAVE_DOC, {
    onCompleted: (data: any) => {
      if (data?.saveDoc) {
        const saved = data.saveDoc;
        lastSavedRef.current = saved.updatedAt;
        setSavedText(text);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
        refetchRelatedDocs();
        if (saved.formatType && saved.formatType !== formatTypeRef.current) {
          const newFormatType = (saved.formatType as 'text' | 'json' | 'php' | 'javascript' | 'markdown') || 'text';
          setFormatType(newFormatType);
          formatTypeRef.current = newFormatType;
        }
      }
    },
    onError: (error: any) => {
      if (error.message.includes('Senha necessária') && !showPasswordModalRef.current) {
        setPendingSave(text);
        setShowPasswordModal(true);
        setModalMode('save');
        setPasswordError('');
        setStatus('waiting_password');
      } else {
        setPasswordError(error.message);
        setStatus('idle');
      }
    },
  });

  // GraphQL Mutation para desbloquear documento
  const [unlockDocMutation] = useMutation(UNLOCK_DOC, {
    onCompleted: (data: any) => {
      if (data?.unlockDoc) {
        const unlocked = data.unlockDoc;
        setText(unlocked.text || '');
        setSavedText(unlocked.text || '');
        setIsReadLocked(false);
        setUnlockPasswordInput('');
        setUnlockPasswordError('');
        setStatus('idle');
        refetchRelatedDocs();
      }
    },
    onError: (error: any) => {
      setUnlockPasswordError(error.message);
    },
  });

  // GraphQL Mutation para configurar acesso
  const [setDocAccessMutation] = useMutation(SET_DOC_ACCESS, {
    onCompleted: () => {
      const hasPasswordNow = !!passwordInput || hasPassword;
      setHasPassword(hasPasswordNow);
      setRequiresPassword(isHome || requiresPasswordCheckbox);
      setRequiresReadPassword(requiresReadCheckbox);
      setShowPasswordModal(false);
      const savedPassword = passwordInput;
      setPasswordInput('');
      setPasswordError('');
      setModalMode(null);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);

      if (pendingSave && pendingSave !== '') {
        saveDoc(pendingSave, savedPassword);
        setPendingSave(null);
      } else {
        setPendingSave(null);
      }
      refetchDoc();
    },
    onError: (error: any) => {
      setPasswordError(error.message);
      setStatus('idle');
    },
  });

  // Atualizar contagem de usuários ativos
  useEffect(() => {
    if ((activeUserData as any)?.activeUserCount !== undefined) {
      setActiveUserCount((activeUserData as any).activeUserCount);
    }
  }, [activeUserData]);

  // Registrar usuário quando monta o componente
  useEffect(() => {
    if (isBlocked) return;
    
    const userId = userIdRef.current;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isUnloading = false;

    // Registrar usuário
    registerUserMutation({
      variables: { path: slug, userId },
    }).then((result: any) => {
      if (result?.data?.registerActiveUser !== undefined) {
        setActiveUserCount(result.data.registerActiveUser);
      }
    });

    // Função de heartbeat
    const sendHeartbeat = () => {
      if (!isUnloading) {
        registerUserMutation({
          variables: { path: slug, userId },
        });
      }
    };

    // Heartbeat: atualizar presença a cada 15 segundos
    heartbeatInterval = setInterval(sendHeartbeat, 15000);

    // Pausar heartbeat quando aba está em background (mas não desregistrar)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Aba em background - pausar heartbeat temporariamente
        // Mas não desregistrar, pois o usuário ainda está com a aba aberta
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      } else {
        // Aba voltou ao foco - retomar heartbeat
        if (!heartbeatInterval && !isUnloading) {
          sendHeartbeat(); // Enviar imediatamente
          heartbeatInterval = setInterval(sendHeartbeat, 15000);
        }
      }
    };

    // Desregistrar apenas quando realmente fechar a aba/janela
    const handleBeforeUnload = () => {
      isUnloading = true;
      
      // Tentar desregistrar usando fetch com keepalive
      const mutation = `mutation UnregisterActiveUser($path: String!, $userId: String!) {
        unregisterActiveUser(path: $path, userId: $userId)
      }`;
      
      try {
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: mutation,
            variables: { path: slug, userId },
          }),
          keepalive: true, // Permite que a requisição continue mesmo após a página fechar
        }).catch(() => {
          // Ignorar erros - o sistema de limpeza automática vai remover usuários inativos
        });
      } catch (e) {
        // Ignorar erros - o sistema de limpeza automática vai remover usuários inativos
      }
    };

    // Desregistrar quando componente desmonta (navegação para outra página)
    const cleanup = () => {
      isUnloading = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      unregisterUserMutation({
        variables: { path: slug, userId },
      });
    };

    // Adicionar listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      cleanup();
    };
  }, [slug, isBlocked, registerUserMutation, unregisterUserMutation]);

  // Carregar documentos relacionados quando necessário
  useEffect(() => {
    if (!isBlocked && !isReadLocked && !relatedDocsLoading) {
      // Forçar refetch quando as condições mudarem
      refetchRelatedDocs().catch(() => {
        // Ignorar erros silenciosamente
      });
    }
  }, [slug, isBlocked, isReadLocked, refetchRelatedDocs, relatedDocsLoading]);

  // Função de salvamento
  const saveDoc = useCallback(
    async (content: string, password?: string, formatTypeOverride?: 'text' | 'json' | 'php' | 'javascript' | 'markdown'): Promise<boolean> => {
      setStatus('saving');
      isSavingRef.current = true;
      pendingSaveTextRef.current = content;
      const finalFormatType = formatTypeOverride || formatType;
      
      // Atualizar texto local imediatamente (optimistic update)
      setText(content);
      setSavedText(content);

      try {
        const result = await saveDocMutation({
          variables: {
            path: slug,
            text: content,
            password,
            formatType: finalFormatType,
          },
        });
        
        // Se a mutation retornou dados com updatedAt, atualizar imediatamente
        const saveResult = result?.data as any;
        if (saveResult?.saveDoc?.updatedAt) {
          lastSavedRef.current = saveResult.saveDoc.updatedAt;
        } else {
          // Se não tem updatedAt na resposta, usar timestamp atual
          lastSavedRef.current = Date.now();
        }
        
        // Aguardar um pouco para o servidor processar e o polling atualizar
        // O useEffect vai detectar quando o servidor confirmar
        setTimeout(() => {
          if (isSavingRef.current) {
            // Se ainda está salvando após timeout, considerar como salvo
            isSavingRef.current = false;
            pendingSaveTextRef.current = null;
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 2000);
          }
        }, 3000);
        
        return true;
      } catch (error: any) {
        isSavingRef.current = false;
        pendingSaveTextRef.current = null;
        setPasswordError(error.message || 'Erro ao salvar');
        setStatus('idle');
        return false;
      }
    },
    [slug, formatType, saveDocMutation]
  );

  // Handler para desbloquear leitura
  const handleUnlockRead = useCallback(async () => {
    if (!unlockPasswordInput) {
      setUnlockPasswordError('Digite a senha');
      return;
    }

    setUnlockPasswordError('');

    try {
      const result = await unlockDocMutation({
        variables: {
          path: slug,
          password: unlockPasswordInput,
          userId: userIdRef.current,
        },
      });
      
      // Salvar token de sessão no localStorage
      const sessionToken = (result?.data as any)?.unlockDoc?.sessionToken;
      if (sessionToken) {
        const storageKey = `doc_session_${slug}`;
        localStorage.setItem(storageKey, sessionToken);
      }
    } catch (error: any) {
      setUnlockPasswordError(error.message || 'Erro ao desbloquear');
    }
  }, [slug, unlockPasswordInput, unlockDocMutation]);

  // Handler para confirmar senha
  const handlePasswordSubmit = async () => {
    if (!pendingSave && pendingSave !== '') return;

    setPasswordError('');

    if (modalMode === 'unlock_read') {
      try {
        const result = await unlockDocMutation({
          variables: {
            path: slug,
            password: passwordInput,
            userId: userIdRef.current,
          },
        });
        
        // Salvar token de sessão no localStorage
        const sessionToken = (result?.data as any)?.unlockDoc?.sessionToken;
        if (sessionToken) {
          const storageKey = `doc_session_${slug}`;
          localStorage.setItem(storageKey, sessionToken);
        }
        
        setText(doc?.text || '');
        setSavedText(doc?.text || '');
        setIsReadLocked(false);
        setShowPasswordModal(false);
        setPasswordInput('');
        setPendingSave(null);
        setModalMode(null);
        setStatus('idle');
      } catch (error: any) {
        setPasswordError(error.message || 'Erro ao desbloquear');
      }
      return;
    }

    const result = await saveDoc(pendingSave, passwordInput);
    if (result) {
      setShowPasswordModal(false);
      setPasswordInput('');
      setPendingSave(null);
      setModalMode(null);
    }
  };

  // Handler para salvar configuração de senha
  const handleSavePasswordSettings = async () => {
    // Validação PRINCIPAL: se está configurando acesso e não selecionou nenhum checkbox (exceto se for home)
    // Esta validação deve ser a PRIMEIRA e mais importante
    if ((modalMode === 'config_access' || modalMode === null) && !isHome && !requiresPasswordCheckbox && !requiresReadCheckbox) {
      // Verificar se está tentando remover proteção (já tinha senha e está desmarcando tudo)
      const hadProtection = hasPassword && (requiresPassword || requiresReadPassword);
      const isRemovingProtection = hadProtection && !requiresPasswordCheckbox && !requiresReadCheckbox;
      
      // Se não está removendo proteção, mostrar erro
      if (!isRemovingProtection) {
        setPasswordError('Selecione Leitura e/ou Gravação para definir uma senha');
        setStatus('idle');
        return;
      }
    }

    const needsProtection = isHome || requiresPasswordCheckbox || requiresReadCheckbox;
    const isChangingConfig = modalMode === 'config_access' && hasPassword;
    
    // Se está removendo proteção (desmarcando checkboxes quando já tem senha), permitir sem senha
    const isRemovingProtection = isChangingConfig && !needsProtection;

    // Se está configurando acesso NOVO e precisa de proteção, senha é obrigatória
    if (modalMode === 'config_access' && needsProtection && !passwordInput && !isChangingConfig) {
      setPasswordError('Senha é obrigatória');
      setStatus('idle');
      return;
    }

    // Se está mudando configuração e tem senha, mas não está removendo proteção, precisa da senha atual
    if (isChangingConfig && !isRemovingProtection && !passwordInput) {
      setPasswordError('Digite a senha atual para alterar a configuração');
      setStatus('idle');
      return;
    }

    setStatus('saving');

    try {
      await setDocAccessMutation({
        variables: {
          path: slug,
          password: modalMode === 'config_access' && hasPassword ? null : passwordInput || null,
          requiresPassword: isHome || requiresPasswordCheckbox,
          requiresReadPassword: requiresReadCheckbox,
          currentPassword: modalMode === 'config_access' && hasPassword ? passwordInput : undefined,
        },
      });
    } catch (error: any) {
      setPasswordError(error.message || 'Erro ao salvar senha');
      setStatus('idle');
    }
  };

  // Handler de mudança de texto
  const handleChange = useCallback(
    (value: string) => {
      setText(value);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        const needsPassword = isHome || requiresPasswordCheckbox;
        if (needsPassword && !hasPassword) {
          setPendingSave(value);
          setShowPasswordModal(true);
          setModalMode(null);
          setPasswordError('');
          setStatus('waiting_password');
        } else {
          saveDoc(value);
        }
      }, 1200);
    },
    [isHome, requiresPasswordCheckbox, hasPassword, saveDoc]
  );

  // Handler de blur
  const handleBlur = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const needsPassword = isHome || requiresPasswordCheckbox;
    if (needsPassword && !hasPassword) {
      setPendingSave(text);
      setShowPasswordModal(true);
      setModalMode(null);
      setPasswordError('');
      setStatus('waiting_password');
    } else {
      saveDoc(text);
    }
  }, [text, isHome, requiresPasswordCheckbox, hasPassword, saveDoc]);

  // Funções de formatação
  const formatText = (content: string, type: 'text' | 'json' | 'php' | 'javascript' | 'markdown'): string => {
    if (!content.trim()) return content;

    switch (type) {
      case 'json':
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content;
        }
      case 'javascript':
      case 'php':
        return content; // Formatação básica pode ser adicionada depois
      case 'markdown':
        return content;
      default:
        return content;
    }
  };

  // Handler para mudança de tipo de formatação
  const handleFormatChange = async (newType: 'text' | 'json' | 'php' | 'javascript' | 'markdown') => {
    const oldType = formatType;
    setFormatType(newType);
    formatTypeRef.current = newType;

    if (text.trim()) {
      const formatted = formatText(text, newType);
      setText(formatted);
      setSavedText(formatted);

      const needsPassword = isHome || requiresPasswordCheckbox;
      if (needsPassword && !hasPassword) {
        setPendingSave(formatted);
        setShowPasswordModal(true);
        setModalMode(null);
        setPasswordError('');
        setStatus('waiting_password');
        setFormatType(oldType);
      } else {
        await saveDoc(formatted, undefined, newType);
      }
    } else {
      const needsPassword = isHome || requiresPasswordCheckbox;
      if (needsPassword && !hasPassword) {
        setPendingSave('');
        setShowPasswordModal(true);
        setModalMode(null);
        setPasswordError('');
        setStatus('waiting_password');
        setFormatType(oldType);
      } else {
        await saveDoc('', undefined, newType);
      }
    }
  };

  // Configurar extensões do CodeMirror
  const getExtensions = () => {
    switch (formatType) {
      case 'json':
        return [json()];
      case 'javascript':
        return [javascript()];
      case 'php':
        return [php()];
      case 'markdown':
        return [markdown()];
      default:
        return [];
    }
  };

  const getRelativePath = (fullPath: string) => {
    if (fullPath.startsWith(slug + '/')) {
      return fullPath.substring(slug.length + 1);
    }
    return fullPath;
  };

  const getStatusText = () => {
    switch (status) {
      case 'saving':
        return 'Salvando...';
      case 'saved':
        return 'Salvo';
      case 'waiting_password':
        return 'Aguardando senha';
      case 'not_saved':
        return 'Não salvou';
      default:
        return '';
    }
  };

  const hasPendingChanges = text !== savedText;

  // Sincronizar ref com estado
  useEffect(() => {
    showPasswordModalRef.current = showPasswordModal;
  }, [showPasswordModal]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (docLoading) {
    return (
      <div className="flex h-full w-full bg-base-100">
        <div className="w-[31px] shrink-0 bg-base-200 border-r border-base-300 p-2 space-y-2">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="h-3 w-3 bg-base-300 rounded animate-pulse" />
          ))}
        </div>
        <div className="flex-1 space-y-2 pl-2">
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton h-4 w-5/6"></div>
          <div className="skeleton h-4 w-4/5"></div>
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton h-4 w-3/4"></div>
        </div>
      </div>
    );
  }

  if (docError) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <p className="text-error">Erro ao carregar documento</p>
          <p className="text-sm text-base-content/60 mt-2">
            {docError.message || 'Erro desconhecido'}
          </p>
          <button
            className="btn btn-sm btn-primary mt-4"
            onClick={() => refetchDoc()}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed lg:static lg:translate-x-0 z-30 w-64 h-full bg-base-200 shadow-lg transition-transform duration-300 ease-in-out`}
      >
        <div className="p-4 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {parentPath && (
                <button
                  className="btn btn-xs btn-outline"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/${parentPath}`);
                    setSidebarOpen(false);
                  }}
                >
                  ←
                </button>
              )}
              <h2 className="text-lg font-semibold">Links relacionados</h2>
            </div>
            <button className="lg:hidden btn btn-sm btn-ghost" onClick={() => setSidebarOpen(false)}>
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {relatedDocs.length === 0 ? (
              <p className="text-sm text-base-content/60">Nenhum link</p>
            ) : (
              <ul className="space-y-1">
                {relatedDocs.map((doc) => (
                  <li key={doc.path}>
                    <a
                      href={`/${doc.path}`}
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(`/${doc.path}`);
                        setSidebarOpen(false);
                      }}
                      className="block px-3 py-2 rounded-lg hover:bg-base-300 transition-colors text-sm font-mono break-all"
                    >
                      /{getRelativePath(doc.path)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Overlay para mobile */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="navbar bg-base-200 shadow-sm">
          <div className="flex-1">
            <button className="lg:hidden btn btn-ghost btn-sm mr-2" onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
            <a className="btn btn-ghost text-xl relative">
              texxt
              {(status !== 'idle' || hasPendingChanges) && (
                <span
                  className={`absolute -top-1 left-[100%] px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border-2 border-base-100 ${
                    status === 'saving'
                      ? 'bg-primary text-primary-content animate-pulse'
                      : status === 'saved'
                      ? 'bg-success text-success-content'
                      : status === 'waiting_password'
                      ? 'bg-warning text-warning-content'
                      : status === 'not_saved'
                      ? 'bg-error text-error-content'
                      : hasPendingChanges
                      ? 'bg-warning text-warning-content'
                      : 'bg-primary text-primary-content'
                  }`}
                >
                  {status !== 'idle' ? getStatusText() : hasPendingChanges ? 'Alterações pendentes' : ''}
                </span>
              )}
            </a>
          </div>
          <div className="flex-none">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {/* Contador de usuários ativos */}
                {!isBlocked && (
                  <div
                    className="tooltip tooltip-bottom"
                    data-tip={`${activeUserCount} ${activeUserCount === 1 ? 'navegador' : 'navegadores'} lendo no momento`}
                  >
                    <div className="flex items-center gap-1 text-sm text-base-content/70 cursor-help">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                        />
                      </svg>
                      <span className="font-medium">{activeUserCount}</span>
                    </div>
                  </div>
                )}
                <div
                  className="tooltip tooltip-bottom"
                  data-tip={
                    requiresReadPassword && requiresPassword
                      ? '🔒 Bloqueado para leitura e gravação - Configurar'
                      : requiresReadPassword
                      ? '🔒 Bloqueado para leitura - Configurar'
                      : requiresPassword
                      ? '🔒 Bloqueado para gravação - Configurar'
                      : '🔓 Sem bloqueio - Configurar'
                  }
                >
                  <button
                    className="text-lg cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={() => {
                      setShowPasswordModal(true);
                      setModalMode('config_access');
                      setRequiresPasswordCheckbox(requiresPassword);
                      setRequiresReadCheckbox(requiresReadPassword);
                      setPasswordInput('');
                      setPasswordError('');
                      setTimeout(() => {
                        passwordInputRef.current?.focus();
                      }, 100);
                    }}
                  >
                    {requiresReadPassword || requiresPassword ? '🔒' : '🔓'}
                  </button>
                </div>
                <div className="text-sm text-base-content/70">
                  <span className="font-mono">/{slug}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="select select-sm select-bordered"
                  value={formatType}
                  onChange={(e) => handleFormatChange(e.target.value as 'text' | 'json' | 'php' | 'javascript' | 'markdown')}
                >
                  <option value="text">Texto</option>
                  <option value="json">JSON</option>
                  <option value="php">PHP</option>
                  <option value="javascript">JavaScript</option>
                  <option value="markdown">Markdown</option>
                </select>
                <button
                  className="btn btn-sm btn-ghost btn-square"
                  onClick={() => {
                    setShowPasswordModal(true);
                    setModalMode('config_access');
                    setPendingSave(null);
                    setPasswordInput('');
                    setPasswordError('');
                    setStatus('waiting_password');
                  }}
                  title="Configurar acesso"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Editor */}
        <main className="flex-1 overflow-hidden relative">
          {isBlocked ? (
            <div className="flex h-full w-full items-center justify-center bg-base-100">
              <div className="text-center space-y-4 max-w-md px-4">
                <div className="text-6xl">🚫</div>
                <h2 className="text-2xl font-bold">Documento Bloqueado</h2>
                <p className="text-base-content/70">Este documento foi bloqueado pelo administrador e não pode ser acessado.</p>
                {blockedReason && (
                  <div className="bg-base-200/30 p-4 w-full">
                    <span className="text-sm">
                      <strong>Motivo:</strong> {blockedReason}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <CodeMirror
              key={formatType}
              value={text}
              onChange={handleChange}
              onBlur={handleBlur}
              extensions={getExtensions()}
              placeholder="Type your text here..."
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                dropCursor: false,
                allowMultipleSelections: false,
                indentOnInput: true,
                bracketMatching: true,
                closeBrackets: true,
              }}
              className="h-full w-full"
              style={{ height: '100%' }}
            />
          )}
        </main>
      </div>

      {/* Overlay com Blur para senha de leitura */}
      {isReadLocked && <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-30" />}

      {/* Barra de Desbloqueio de Leitura */}
      {isReadLocked && (
        <div className="absolute bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 shadow-lg z-40">
          <div className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-2xl">🔒</div>
              <h3 className="text-sm font-bold">Este documento requer senha para leitura</h3>

              <div className="flex-1 min-w-[200px] relative">
                <input
                  ref={unlockPasswordInputRef}
                  type="password"
                  className="input input-bordered input-sm w-full"
                  value={unlockPasswordInput}
                  onChange={(e) => {
                    setUnlockPasswordInput(e.target.value);
                    setUnlockPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleUnlockRead();
                    }
                  }}
                  placeholder="Digite a senha"
                />
                {unlockPasswordError && (
                  <div className="absolute bottom-full left-0 mb-2 bg-error text-error-content text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                    {unlockPasswordError}
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-error"></div>
                  </div>
                )}
              </div>

              <button className="btn btn-sm btn-primary" onClick={handleUnlockRead}>
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay com Blur para configuração de senha */}
      {showPasswordModal && <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-30" />}

      {/* Barra de Senha no Rodapé */}
      {showPasswordModal && (
        <div className="absolute bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 shadow-lg z-40" tabIndex={-1}>
          <div className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-sm font-bold">
                {modalMode === 'config_access'
                  ? 'Configurar acesso (Leitura/Gravação)'
                  : modalMode === 'unlock_read'
                  ? 'Digite a senha para desbloquear'
                  : modalMode === 'save'
                  ? 'Digite a senha para editar'
                  : 'Definir senha'}
              </h3>

              {(modalMode === null || modalMode === 'config_access') && (
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={requiresPasswordCheckbox}
                      onChange={(e) => setRequiresPasswordCheckbox(e.target.checked)}
                    />
                    <span className="text-sm">Gravação</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" title="Se marcado, exigirá senha para abrir o link">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={requiresReadCheckbox}
                      onChange={(e) => setRequiresReadCheckbox(e.target.checked)}
                    />
                    <span className="text-sm">Leitura</span>
                  </label>
                </div>
              )}

              <div className="flex-1 min-w-[200px] relative">
                <input
                  ref={passwordInputRef}
                  type="password"
                  className="input input-bordered input-sm w-full"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (modalMode === 'config_access' || modalMode === null) {
                        handleSavePasswordSettings();
                      } else {
                        handlePasswordSubmit();
                      }
                    }
                  }}
                  placeholder="Digite a senha"
                />
                {passwordError && (
                  <div className="absolute bottom-full left-0 mb-2 bg-error text-error-content text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                    {passwordError}
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-error"></div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    if (modalMode === 'config_access' || modalMode === null) {
                      handleSavePasswordSettings();
                    } else {
                      handlePasswordSubmit();
                    }
                  }}
                >
                  {pendingSave ? 'Salvar' : 'Confirmar'}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                    setPasswordError('');
                    if (modalMode === null && !isHome) {
                      setRequiresPasswordCheckbox(false);
                    }
                    if (modalMode === 'config_access') {
                      setRequiresPasswordCheckbox(requiresPassword);
                      setRequiresReadCheckbox(requiresReadPassword);
                    }
                    setPendingSave(null);
                    setModalMode(null);
                    if (modalMode === 'save') {
                      setStatus('not_saved');
                      setTimeout(() => {
                        setStatus('idle');
                      }, 3000);
                    }
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

