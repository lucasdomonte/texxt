'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { php } from '@codemirror/lang-php';
import { markdown } from '@codemirror/lang-markdown';

interface DocData {
  text: string;
  updatedAt: number;
  requiresPassword?: boolean;
  requiresReadPassword?: boolean;
  hasPassword?: boolean;
  isHome?: boolean;
  formatType?: string;
  locked?: boolean;
}

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
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isHome, setIsHome] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [unlockPasswordError, setUnlockPasswordError] = useState('');
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'save' | 'unlock_read' | 'config_access' | null>(null);
  const [requiresPasswordCheckbox, setRequiresPasswordCheckbox] = useState(false);
  const [shouldOpenPasswordModal, setShouldOpenPasswordModal] = useState(false);
  const [formatType, setFormatType] = useState<'text' | 'json' | 'php' | 'javascript' | 'markdown'>('text');
  const [requiresReadPassword, setRequiresReadPassword] = useState(false);
  const [isReadLocked, setIsReadLocked] = useState(false);
  const [requiresReadCheckbox, setRequiresReadCheckbox] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isInitialLoadRef = useRef(true);
  const lastSavedRef = useRef<number | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const unlockPasswordInputRef = useRef<HTMLInputElement>(null);
  const formatTypeRef = useRef<'text' | 'json' | 'php' | 'javascript' | 'markdown'>('text');
  const showPasswordModalRef = useRef(false);

  // Função para carregar documentos relacionados
  const loadRelatedDocs = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('load-related', { path: slug });
    }
  }, [slug]);

  // Inicializar WebSocket e carregar documento
  useEffect(() => {
    // Conectar ao WebSocket
    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    // Quando conectado, carregar documento
    socket.on('connect', () => {
      socket.emit('load-doc', { path: slug });
      // Não carregar links relacionados aqui - será carregado após desbloquear se necessário
    });

    // Receber documento carregado
    socket.on('doc-loaded', (data: DocData) => {
      const initialText = data.text || '';
      setText(initialText);
      setSavedText(initialText);
      setLastSaved(data.updatedAt);
      lastSavedRef.current = data.updatedAt;
      setRequiresPassword(data.requiresPassword || false);
      setRequiresReadPassword(data.requiresReadPassword || false);
      setHasPassword(data.hasPassword || false);
      setIsHome(data.isHome || false);
      setRequiresPasswordCheckbox(data.requiresPassword || false);
      setRequiresReadCheckbox(data.requiresReadPassword || false);
      setIsReadLocked(!!data.locked);
      const newFormatType = (data.formatType as 'text' | 'json' | 'php' | 'javascript' | 'markdown') || 'text';
      setFormatType(newFormatType);
      formatTypeRef.current = newFormatType;
      
      isInitialLoadRef.current = false;
      setStatus('idle');
      
      // Carregar links relacionados apenas se não estiver bloqueado
      if (!data.locked) {
        socket.emit('load-related', { path: slug });
      }
    });

    // Receber atualizações em tempo real
    socket.on('doc-updated', (data: DocData) => {
      // Só atualizar se não for a nossa própria edição recente
      if (data.updatedAt !== lastSavedRef.current) {
        setText(data.text);
        setSavedText(data.text);
        setLastSaved(data.updatedAt);
        lastSavedRef.current = data.updatedAt;
        if (data.formatType && data.formatType !== formatTypeRef.current) {
          const newFormatType = (data.formatType as 'text' | 'json' | 'php' | 'javascript' | 'markdown') || 'text';
          setFormatType(newFormatType);
          formatTypeRef.current = newFormatType;
        }
        setStatus('saved');
      }
    });

    // Receber documentos relacionados
    socket.on('related-loaded', (data: { docs: RelatedDoc[] }) => {
      setRelatedDocs(data.docs || []);
    });

    // Receber erros
    socket.on('error', (data: { message: string }) => {
    });

    // Receber bloqueio de documento
    socket.on('doc-blocked', (data: { message: string; reason: string | null; blockedAt: number | null }) => {
      setIsBlocked(true);
      setBlockedReason(data.reason);
      isInitialLoadRef.current = false;
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [slug]);


  // Função de salvamento via WebSocket
  const saveDoc = useCallback((content: string, password?: string, formatTypeOverride?: 'text' | 'json' | 'php' | 'javascript' | 'markdown'): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        setPasswordError('Não conectado ao servidor');
        resolve(false);
        return;
      }

      setStatus('saving');
      const finalFormatType = formatTypeOverride || formatType;

      // Handler temporário para resposta de salvamento
      const onSaved = (data: DocData) => {
        setLastSaved(data.updatedAt);
        lastSavedRef.current = data.updatedAt;
        setSavedText(content);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
        
        // Atualizar lista de documentos relacionados após salvar
        setTimeout(() => {
          loadRelatedDocs();
        }, 500);
        
        if (data.formatType && data.formatType !== formatTypeRef.current) {
          const newFormatType = (data.formatType as 'text' | 'json' | 'php' | 'javascript' | 'markdown') || 'text';
          setFormatType(newFormatType);
          formatTypeRef.current = newFormatType;
        }
        
        socketRef.current?.off('doc-saved', onSaved);
        socketRef.current?.off('save-error', onError);
        resolve(true);
      };

      const onError = (errorData: { error: string; requiresPassword?: boolean }) => {
        if (errorData.requiresPassword && !showPasswordModalRef.current) {
          // Precisa de senha - mostrar modal (só se não estiver já aberto)
          setPendingSave(content);
          setShowPasswordModal(true);
          setModalMode('save');
          setPasswordError('');
          setStatus('waiting_password');
        } else {
          // Se já está no modal ou é outro tipo de erro, apenas exibir o erro
          setPasswordError(errorData.error || 'Erro ao salvar');
          setStatus('idle');
        }
        
        socketRef.current?.off('doc-saved', onSaved);
        socketRef.current?.off('save-error', onError);
        resolve(false);
      };

      socketRef.current.once('doc-saved', onSaved);
      socketRef.current.once('save-error', onError);
      
      socketRef.current.emit('save-doc', {
        path: slug,
        text: content,
        password,
        formatType: finalFormatType,
      });
    });
  }, [slug, loadRelatedDocs, formatType]);

  // Handler para desbloquear leitura diretamente do overlay
  const handleUnlockRead = useCallback(() => {
    if (!unlockPasswordInput) {
      setUnlockPasswordError('Digite a senha');
      return;
    }

    if (!socketRef.current?.connected) {
      setUnlockPasswordError('Não conectado ao servidor');
      return;
    }

    setUnlockPasswordError('');
    socketRef.current.emit('unlock-read', { path: slug, password: unlockPasswordInput });

    const onLoaded = (data: DocData) => {
      if (data.locked) {
        setUnlockPasswordError('Senha incorreta');
      } else {
        setText(data.text || '');
        setSavedText(data.text || '');
        setIsReadLocked(false);
        setUnlockPasswordInput('');
        setUnlockPasswordError('');
        setStatus('idle');
        
        // Carregar links relacionados após desbloquear
        if (socketRef.current?.connected) {
          socketRef.current.emit('load-related', { path: slug });
        }
      }
      socketRef.current?.off('doc-loaded', onLoaded);
      socketRef.current?.off('unlock-error', onError);
    };

    const onError = (e: { error: string }) => {
      setUnlockPasswordError(e.error || 'Erro ao desbloquear');
      socketRef.current?.off('doc-loaded', onLoaded);
      socketRef.current?.off('unlock-error', onError);
    };

    socketRef.current.once('doc-loaded', onLoaded);
    socketRef.current.once('unlock-error', onError);
  }, [slug, unlockPasswordInput]);

  // Handler para confirmar senha (quando está salvando documento)
  const handlePasswordSubmit = async () => {
    if (!pendingSave && pendingSave !== '') return;

    setPasswordError('');

    // Desbloquear leitura
    if (modalMode === 'unlock_read') {
      if (!socketRef.current?.connected) {
        setPasswordError('Não conectado ao servidor');
        return;
      }
      socketRef.current.emit('unlock-read', { path: slug, password: passwordInput });

      const onLoaded = (data: DocData) => {
        if (data.locked) {
          setPasswordError('Senha incorreta');
        } else {
          setText(data.text || '');
          setSavedText(data.text || '');
          setIsReadLocked(false);
          setShowPasswordModal(false);
          setPasswordInput('');
          setPendingSave(null);
          setModalMode(null);
          setStatus('idle');
        }
        socketRef.current?.off('doc-loaded', onLoaded);
        socketRef.current?.off('unlock-error', onError);
      };
      const onError = (e: { error: string }) => {
        setPasswordError(e.error || 'Erro ao desbloquear');
        socketRef.current?.off('doc-loaded', onLoaded);
        socketRef.current?.off('unlock-error', onError);
      };
      socketRef.current.once('doc-loaded', onLoaded);
      socketRef.current.once('unlock-error', onError);
      return;
    }

    // Caso normal: salvar documento
    const result = await saveDoc(pendingSave, passwordInput);
    if (result) {
      setShowPasswordModal(false);
      setPasswordInput('');
      setPendingSave(null);
      setModalMode(null);
    } else {
      // Se falhou, o erro já foi tratado pelo saveDoc (que exibe no passwordError)
      // Não fechar o modal para que o usuário possa tentar novamente
    }
  };

  // Handler para salvar com senha do modal (Enter)
  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (modalMode === 'config_access' || modalMode === null) {
        // Configurar acesso ou definir senha pela primeira vez
        handleSavePasswordSettings();
      } else {
        // Salvar documento ou desbloquear leitura
        handlePasswordSubmit();
      }
    }
  };

  // Handler para fechar modal com ESC
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowPasswordModal(false);
      setPasswordInput('');
      setPasswordError('');
      // Se estava configurando senha (pendingSave === null) e não é home, desmarcar checkbox
      if (pendingSave === null && !isHome) {
        setRequiresPasswordCheckbox(false);
      }
      setPendingSave(null);
      setStatus('not_saved');
      // Voltar para idle após 3 segundos
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  };

  // Handler unificado do botão Confirmar
  const handleConfirmClick = () => {
    if (modalMode === 'config_access' || modalMode === null) {
      handleSavePasswordSettings();
    } else {
      handlePasswordSubmit();
    }
  };

  // Handler de mudança de texto (para CodeMirror)
  const handleChange = useCallback((value: string) => {
    setText(value);

    // Limpar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: salvar após 1.2s de inatividade
    saveTimeoutRef.current = setTimeout(() => {
      const needsPassword = isHome || requiresPasswordCheckbox;
      if (needsPassword && !hasPassword) {
        // Se precisa de senha mas ainda não tem, pedir para definir
        setPendingSave(value);
        setShowPasswordModal(true);
        setModalMode(null);
        setPasswordError('');
        setStatus('waiting_password');
      } else {
        saveDoc(value);
      }
    }, 1200);
  }, [isHome, requiresPasswordCheckbox, hasPassword, saveDoc]);

  // Salvar ao sair do campo (para CodeMirror)
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

  // Salvar configuração de senha (quando está configurando senha, não autenticando)
  const handleSavePasswordSettings = async () => {
    // Deve escolher ao menos uma opção quando habilitando pela primeira vez
    if (modalMode === null && !requiresPasswordCheckbox && !requiresReadCheckbox && !isHome) {
      setPasswordError('Selecione Leitura e/ou Gravação');
      return;
    }

    // Senha sempre obrigatória quando:
    // 1. Está habilitando alguma proteção (isHome, requiresPasswordCheckbox, requiresReadCheckbox)
    // 2. Está no modo config_access (alterando configurações) e já tem senha
    const needsProtection = isHome || requiresPasswordCheckbox || requiresReadCheckbox;
    const isChangingConfig = modalMode === 'config_access' && hasPassword;
    
    if (!passwordInput && (needsProtection || isChangingConfig)) {
      setPasswordError('Senha é obrigatória');
      return;
    }

    if (!socketRef.current?.connected) {
      setPasswordError('Não conectado ao servidor');
      return;
    }

    // Enviar configuração estendida com leitura/escrita
    setStatus('saving');
    
    const onUpdated = (data?: { success?: boolean }) => {
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
      
      // Se tinha um save pendente, executar agora
      if (pendingSave && pendingSave !== '') {
        saveDoc(pendingSave, savedPassword);
        setPendingSave(null);
      } else {
        setPendingSave(null);
      }
      
      socketRef.current?.off('password-updated', onUpdated);
      socketRef.current?.off('password-update-error', onError);
    };

    const onError = (errorData: { error: string }) => {
      setPasswordError(errorData.error || 'Erro ao salvar senha');
      setStatus('idle');
      socketRef.current?.off('password-updated', onUpdated);
      socketRef.current?.off('password-update-error', onError);
    };

    // Registrar handlers ANTES de emitir
    socketRef.current.once('password-updated', onUpdated);
    socketRef.current.once('password-update-error', onError);
    
    // Agora emitir o evento
    if (modalMode === 'config_access' && hasPassword) {
      // Atualizando flags com senha já existente: não alterar senha, validar com senha atual
      socketRef.current.emit('update-password-extended', {
        path: slug,
        password: null,
        requiresPassword: isHome || requiresPasswordCheckbox,
        requiresReadPassword: requiresReadCheckbox,
        currentPassword: passwordInput,
      });
    } else {
      // Definição inicial ou atualizando sem senha: definir senha e flags
      socketRef.current.emit('update-password-extended', {
        path: slug,
        password: passwordInput || null,
        requiresPassword: isHome || requiresPasswordCheckbox,
        requiresReadPassword: requiresReadCheckbox,
      });
    }
  };

  // Sincronizar ref com estado showPasswordModal
  useEffect(() => {
    showPasswordModalRef.current = showPasswordModal;
  }, [showPasswordModal]);

  // Abrir modal quando checkbox é marcado sem senha
  useEffect(() => {
    if (shouldOpenPasswordModal && requiresPasswordCheckbox && !hasPassword) {
      setShowPasswordModal(true);
      setModalMode(null);
      setPendingSave(null);
      setPasswordInput('');
      setPasswordError('');
      setStatus('waiting_password');
      setShouldOpenPasswordModal(false);
    }
  }, [shouldOpenPasswordModal, requiresPasswordCheckbox, hasPassword]);

  // Foco automático no input de desbloqueio quando o overlay aparecer
  useEffect(() => {
    if (isReadLocked && unlockPasswordInputRef.current) {
      const timer = setTimeout(() => {
        unlockPasswordInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isReadLocked]);

  // Foco automático no input de senha quando o modal abrir e handler de ESC
  useEffect(() => {
    if (showPasswordModal) {
      // Focar no input de senha
      const timer = setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 100);

      // Handler global para ESC (funciona mesmo se o input não estiver focado)
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowPasswordModal(false);
          setPasswordInput('');
          setPasswordError('');
          // Usar função de callback para acessar o estado atual
          setPendingSave((currentPendingSave) => {
            if (currentPendingSave === null && !isHome) {
              setRequiresPasswordCheckbox(false);
            }
            return null;
          });
          setStatus('not_saved');
          setTimeout(() => {
            setStatus('idle');
          }, 3000);
        }
      };

      window.addEventListener('keydown', handleEscape);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showPasswordModal, isHome]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Socket cleanup já é feito no useEffect que gerencia a conexão WebSocket
    };
  }, []);

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

  // Verificar se há alterações pendentes
  const hasPendingChanges = text !== savedText;

  // Funções de formatação
  const formatText = (content: string, type: 'text' | 'json' | 'php' | 'javascript' | 'markdown'): string => {
    if (!content.trim()) return content;

    switch (type) {
      case 'json':
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content; // Se não for JSON válido, retorna original
        }
      
      case 'javascript':
        // Formatação básica de JavaScript (indentação)
        return formatJavaScript(content);
      
      case 'php':
        // Formatação básica de PHP (indentação)
        return formatPHP(content);
      
      case 'markdown':
        // Markdown não precisa de formatação especial, apenas retorna o conteúdo
        return content;
      
      default:
        return content;
    }
  };

  const formatJavaScript = (code: string): string => {
    // Formatação básica: adiciona indentação baseada em chaves e parênteses
    let formatted = '';
    let indent = 0;
    const indentSize = 2;
    
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        formatted += '\n';
        continue;
      }
      
      // Decrementa indentação antes de fechar chaves/colchetes
      if (line.endsWith('}') || line.endsWith(']') || line.endsWith(')')) {
        indent = Math.max(0, indent - 1);
      }
      
      formatted += ' '.repeat(indent * indentSize) + line + '\n';
      
      // Incrementa indentação após abrir chaves/colchetes (mas não parênteses)
      if (line.endsWith('{') || line.endsWith('[')) {
        indent++;
      }
      // Incrementa após linhas que terminam com dois pontos (objetos)
      else if (line.endsWith(':') && !line.includes('?')) {
        // Não incrementa, mas mantém
      }
    }
    
    return formatted.trimEnd();
  };

  const formatPHP = (code: string): string => {
    // Formatação básica: similar ao JavaScript
    let formatted = '';
    let indent = 0;
    const indentSize = 2;
    
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        formatted += '\n';
        continue;
      }
      
      // Decrementa indentação antes de fechar chaves
      if (line.endsWith('}')) {
        indent = Math.max(0, indent - 1);
      }
      
      formatted += ' '.repeat(indent * indentSize) + line + '\n';
      
      // Incrementa indentação após abrir chaves
      if (line.endsWith('{')) {
        indent++;
      }
    }
    
    return formatted.trimEnd();
  };

  // Handler para mudança de tipo de formatação
  const handleFormatChange = async (newType: 'text' | 'json' | 'php' | 'javascript' | 'markdown') => {
    const oldType = formatType;
    setFormatType(newType);
    formatTypeRef.current = newType;
    
    if (text.trim()) {
      const formatted = formatText(text, newType);
      setText(formatted);
      // Atualizar também o savedText para evitar "alterações pendentes" após formatação
      setSavedText(formatted);
      
      // Salvar o formatType no banco usando saveDoc (que já trata senha)
      const needsPassword = isHome || requiresPasswordCheckbox;
      if (needsPassword && !hasPassword) {
        // Se precisa de senha mas não tem, pedir para definir
        setPendingSave(formatted);
        setShowPasswordModal(true);
        setModalMode(null);
        setPasswordError('');
        setStatus('waiting_password');
        // Reverter o tipo se cancelar
        setFormatType(oldType);
      } else {
        // Salvar diretamente com o novo formatType
        await saveDoc(formatted, undefined, newType);
      }
    } else {
      // Mesmo sem texto, salvar o formatType
      const needsPassword = isHome || requiresPasswordCheckbox;
      if (needsPassword && !hasPassword) {
        setPendingSave('');
        setShowPasswordModal(true);
        setModalMode(null);
        setPasswordError('');
        setStatus('waiting_password');
        setFormatType(oldType);
      } else {
        // Salvar com o novo formatType mesmo sem texto
        await saveDoc('', undefined, newType);
      }
    }
  };

  // Configurar extensões do CodeMirror baseado no tipo
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
    // Retorna apenas a parte após o slug atual
    if (fullPath.startsWith(slug + '/')) {
      return fullPath.substring(slug.length + 1);
    }
    return fullPath;
  };

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
            <button
              className="lg:hidden btn btn-sm btn-ghost"
              onClick={() => setSidebarOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {relatedDocs.length === 0 ? (
              <p className="text-sm text-base-content/60">
                Nenhum link
              </p>
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
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="navbar bg-base-200 shadow-sm">
          <div className="flex-1">
            <button
              className="lg:hidden btn btn-ghost btn-sm mr-2"
              onClick={() => setSidebarOpen(true)}
            >
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
                {/* Ícone de cadeado com tooltip */}
                <div 
                  className="tooltip tooltip-bottom" 
                  data-tip={
                    requiresReadPassword && requiresPassword
                      ? "🔒 Bloqueado para leitura e gravação - Configurar"
                      : requiresReadPassword
                      ? "🔒 Bloqueado para leitura - Configurar"
                      : requiresPassword
                      ? "🔒 Bloqueado para gravação - Configurar"
                      : "🔓 Sem bloqueio - Configurar"
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
                    {(requiresReadPassword || requiresPassword) ? "🔒" : "🔓"}
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
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
                <p className="text-base-content/70">
                  Este documento foi bloqueado pelo administrador e não pode ser acessado.
                </p>
                {blockedReason && (
                  <div className="bg-base-200/30 p-4 w-full">
                    <span className="text-sm"><strong>Motivo:</strong> {blockedReason}</span>
                  </div>
                )}
              </div>
            </div>
          ) : isInitialLoadRef.current ? (
            <div className="flex h-full w-full bg-base-100">
              {/* Gutter (números de linha) */}
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
      {isReadLocked && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-30" />
      )}

      {/* Barra de Desbloqueio de Leitura */}
      {isReadLocked && (
        <div className="absolute bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 shadow-lg z-40">
          <div className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-2xl">🔒</div>
              <h3 className="text-sm font-bold">
                Este documento requer senha para leitura
              </h3>
              
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

              <button
                className="btn btn-sm btn-primary"
                onClick={handleUnlockRead}
              >
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay com Blur para configuração de senha */}
      {showPasswordModal && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-30" />
      )}

      {/* Barra de Senha no Rodapé */}
      {showPasswordModal && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 shadow-lg z-40"
          onKeyDown={handleModalKeyDown}
          tabIndex={-1}
        >
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
                  onKeyDown={handlePasswordKeyDown}
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
                  onClick={handleConfirmClick}
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

