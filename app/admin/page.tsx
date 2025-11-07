'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Doc {
  path: string;
  updatedAt: number;
  isBlocked: boolean;
  blockedReason?: string | null;
  blockedAt?: number | null;
  uniquePageviews: number;
  totalPageviews: number;
  requiresPassword: boolean;
  requiresReadPassword: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'path' | 'pageviews' | 'updated'>('path');
  const [isBlocking, setIsBlocking] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showChangeAdminPasswordModal, setShowChangeAdminPasswordModal] = useState(false);
  const [showChangeDocPasswordModal, setShowChangeDocPasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');

  // Fazer login e obter token
  const doLogin = async (pwd: string): Promise<string | null> => {
    try {
      
      // Enviar senha via query param (workaround para bug do custom server com body)
      const url = `/api/admin/login?password=${encodeURIComponent(pwd)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        setPasswordError(errorData.error || 'Senha incorreta');
        return null;
      }

      const data = await response.json();
      return data.token;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setPasswordError('Timeout: A requisição demorou muito tempo. Tente novamente.');
      } else {
        setPasswordError('Erro ao fazer login: ' + error.message);
      }
      return null;
    }
  };

  // Carregar documentos
  const loadDocs = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/docs', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setPasswordError('Sessão expirada');
          setIsAuthenticated(false);
          localStorage.removeItem('adminToken');
          return;
        }
        throw new Error('Erro ao carregar documentos');
      }

      const data = await response.json();
      setDocs(data.docs);
      setIsAuthenticated(true);
      localStorage.setItem('adminToken', token);
    } catch (error) {
      setPasswordError('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setIsLoggingIn(true);
    
    try {
      const token = await doLogin(password);
      
      if (token) {
        await loadDocs(token);
      }
    } catch (error) {
      setPasswordError('Erro ao fazer login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Bloquear/Desbloquear
  const handleToggleBlock = async (path: string, isBlocked: boolean) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    if (!isBlocked) {
      // Abrir modal para bloquear
      setSelectedDoc(path);
      setShowBlockModal(true);
      return;
    }

    // Desbloquear diretamente
    try {
      const url = `/api/admin/docs?path=${encodeURIComponent(path)}&action=unblock`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        loadDocs(token);
      }
    } catch (error) {
    }
  };

  // Confirmar bloqueio
  const handleConfirmBlock = async () => {
    if (!selectedDoc) {
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) {
      return;
    }

    setIsBlocking(true);

    try {
      
      // Enviar via query params (workaround para custom server)
      let url = `/api/admin/docs?path=${encodeURIComponent(selectedDoc)}&action=block`;
      if (blockReason) {
        url += `&reason=${encodeURIComponent(blockReason)}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });


      if (response.ok) {
        const data = await response.json();
        setShowBlockModal(false);
        setSelectedDoc(null);
        setBlockReason('');
        await loadDocs(token);
      } else {
        const errorData = await response.json();
        alert(`Erro ao bloquear: ${errorData.error || 'Erro desconhecido'}`);
      }
    } catch (error: any) {
      alert('Erro ao bloquear documento: ' + error.message);
    } finally {
      setIsBlocking(false);
    }
  };

  // Trocar senha do admin
  const handleChangeAdminPassword = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    if (!currentPasswordInput || !newPasswordInput) {
      setChangePasswordError('Preencha todos os campos');
      return;
    }

    try {
      const url = `/api/admin/change-password?currentPassword=${encodeURIComponent(currentPasswordInput)}&newPassword=${encodeURIComponent(newPasswordInput)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || 'Senha alterada com sucesso!');
        setShowChangeAdminPasswordModal(false);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setChangePasswordError('');
      } else {
        const errorData = await response.json();
        setChangePasswordError(errorData.error || 'Erro ao trocar senha');
      }
    } catch (error) {
      setChangePasswordError('Erro ao trocar senha');
    }
  };

  // Trocar senha de um documento
  const handleChangeDocPassword = async () => {
    const token = localStorage.getItem('adminToken');
    
    if (!token || !selectedDoc) {
      return;
    }

    if (!newPasswordInput || !confirmPasswordInput) {
      setChangePasswordError('Preencha todos os campos');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setChangePasswordError('As senhas não coincidem');
      return;
    }

    try {
      const url = `/api/admin/change-doc-password-admin?path=${encodeURIComponent(selectedDoc)}&newPassword=${encodeURIComponent(newPasswordInput)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });


      if (response.ok) {
        alert('Senha do documento alterada com sucesso!');
        setShowChangeDocPasswordModal(false);
        setSelectedDoc(null);
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setChangePasswordError('');
      } else {
        const errorData = await response.json();
        setChangePasswordError(errorData.error || 'Erro ao trocar senha');
      }
    } catch (error) {
      setChangePasswordError('Erro ao trocar senha');
    }
  };

  // Verificar autenticação ao carregar
  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
      loadDocs(savedToken);
    }
  }, []);

  // Filtrar e ordenar documentos
  const filteredDocs = docs
    .filter(doc => doc.path.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'pageviews':
          return b.totalPageviews - a.totalPageviews;
        case 'updated':
          return b.updatedAt - a.updatedAt;
        default:
          return a.path.localeCompare(b.path);
      }
    });

  // Formatear data
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('pt-BR');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">Painel de Administração</h2>
            <form onSubmit={handleLogin}>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Senha de Administrador</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Digite a senha"
                  autoFocus
                />
              </div>
              {passwordError && (
                <div className="alert alert-error mt-4">
                  <span>{passwordError}</span>
                </div>
              )}
              <div className="card-actions justify-end mt-6">
                <button 
                  type="submit" 
                  className="btn btn-primary w-full"
                  disabled={isLoggingIn || !password}
                >
                  {isLoggingIn ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Carregando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Painel de Administração</h1>
            <p className="text-base-content/70">Gerenciar documentos do sistema</p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/')}
            >
              Voltar ao Site
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowChangeAdminPasswordModal(true);
                setCurrentPasswordInput('');
                setNewPasswordInput('');
                setChangePasswordError('');
              }}
            >
              Trocar Senha
            </button>
            <button
              className="btn btn-error"
              onClick={() => {
                localStorage.removeItem('adminToken');
                setIsAuthenticated(false);
                setPassword('');
              }}
            >
              Sair
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="stats shadow mb-6 w-full">
          <div className="stat">
            <div className="stat-title">Total de Documentos</div>
            <div className="stat-value">{docs.length}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Bloqueados</div>
            <div className="stat-value text-error">{docs.filter(d => d.isBlocked).length}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Total de Visualizações</div>
            <div className="stat-value text-primary">
              {docs.reduce((sum, d) => sum + d.totalPageviews, 0)}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="flex gap-4 flex-wrap">
              <div className="form-control flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Buscar por URL..."
                  className="input input-bordered"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="form-control">
                <select
                  className="select select-bordered"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="path">Ordenar por URL</option>
                  <option value="pageviews">Ordenar por Visualizações</option>
                  <option value="updated">Ordenar por Data</option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const token = localStorage.getItem('adminToken');
                  if (token) loadDocs(token);
                }}
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de documentos */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Visualizações</th>
                    <th>Última Atualização</th>
                    <th>Proteção</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8">
                        <span className="loading loading-spinner loading-lg"></span>
                      </td>
                    </tr>
                  ) : filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-base-content/70">
                        Nenhum documento encontrado
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((doc) => (
                      <tr key={doc.path}>
                        <td>
                          <a
                            href={`/${doc.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link link-primary font-mono text-sm"
                          >
                            /{doc.path}
                          </a>
                        </td>
                        <td>
                          <div className="text-sm">
                            <div>Únicas: <strong>{doc.uniquePageviews}</strong></div>
                            <div>Total: <strong>{doc.totalPageviews}</strong></div>
                          </div>
                        </td>
                        <td className="text-sm">{formatDate(doc.updatedAt)}</td>
                        <td>
                          <div className="flex gap-1">
                            {doc.requiresPassword && (
                              <div className="badge badge-warning badge-sm">Gravação</div>
                            )}
                            {doc.requiresReadPassword && (
                              <div className="badge badge-error badge-sm">Leitura</div>
                            )}
                            {!doc.requiresPassword && !doc.requiresReadPassword && (
                              <div className="badge badge-ghost badge-sm">Aberto</div>
                            )}
                          </div>
                        </td>
                        <td>
                          {doc.isBlocked ? (
                            <div className="tooltip" data-tip={doc.blockedReason || 'Sem motivo'}>
                              <div className="badge badge-error gap-2">
                                🚫 Bloqueado
                              </div>
                            </div>
                          ) : (
                            <div className="badge badge-success gap-2">
                              ✓ Ativo
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              className={`btn btn-sm ${doc.isBlocked ? 'btn-success' : 'btn-error'}`}
                              onClick={() => handleToggleBlock(doc.path, doc.isBlocked)}
                            >
                              {doc.isBlocked ? 'Desbloquear' : 'Bloquear'}
                            </button>
                            {(doc.requiresPassword || doc.requiresReadPassword) && (
                              <button
                                className="btn btn-sm btn-warning"
                                onClick={() => {
                                  setSelectedDoc(doc.path);
                                  setShowChangeDocPasswordModal(true);
                                  setNewPasswordInput('');
                                  setConfirmPasswordInput('');
                                  setChangePasswordError('');
                                }}
                                title="Trocar senha do documento"
                              >
                                🔑
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de bloqueio */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="card w-96 bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title">Bloquear Documento</h3>
              <p className="text-sm text-base-content/70 mb-4">
                Documento: <strong className="font-mono">/{selectedDoc}</strong>
              </p>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Motivo do bloqueio (opcional)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered"
                  placeholder="Ex: Conteúdo inapropriado, spam, etc."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="card-actions justify-end mt-4">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowBlockModal(false);
                    setSelectedDoc(null);
                    setBlockReason('');
                  }}
                  disabled={isBlocking}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-error"
                  onClick={handleConfirmBlock}
                  disabled={isBlocking}
                >
                  {isBlocking ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Bloqueando...
                    </>
                  ) : (
                    'Bloquear'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Trocar Senha do Admin */}
      {showChangeAdminPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-96 bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title">Trocar Senha do Admin</h3>
              <p className="text-sm text-base-content/70 mb-4">
                Altere a senha de acesso ao painel de administração
              </p>
              
              {changePasswordError && (
                <div className="alert alert-error mb-4">
                  <span>{changePasswordError}</span>
                </div>
              )}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Senha Atual</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={currentPasswordInput}
                  onChange={(e) => {
                    setCurrentPasswordInput(e.target.value);
                    setChangePasswordError('');
                  }}
                  placeholder="Digite a senha atual"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Nova Senha</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setChangePasswordError('');
                  }}
                  placeholder="Digite a nova senha"
                />
              </div>

              <div className="card-actions justify-end mt-4">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowChangeAdminPasswordModal(false);
                    setCurrentPasswordInput('');
                    setNewPasswordInput('');
                    setChangePasswordError('');
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleChangeAdminPassword}
                >
                  Alterar Senha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Trocar Senha do Documento */}
      {showChangeDocPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-96 bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title">Trocar Senha do Documento</h3>
              <p className="text-sm text-base-content/70 mb-4">
                Documento: <strong className="font-mono">/{selectedDoc}</strong>
              </p>
              
              {changePasswordError && (
                <div className="alert alert-error mb-4">
                  <span>{changePasswordError}</span>
                </div>
              )}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Nova Senha</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setChangePasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleChangeDocPassword();
                    }
                  }}
                  placeholder="Digite a nova senha"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Repita a Nova Senha</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    setChangePasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleChangeDocPassword();
                    }
                  }}
                  placeholder="Repita a nova senha"
                />
              </div>

              <div className="card-actions justify-end mt-4">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowChangeDocPasswordModal(false);
                    setSelectedDoc(null);
                    setNewPasswordInput('');
                    setConfirmPasswordInput('');
                    setChangePasswordError('');
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleChangeDocPassword}
                >
                  Alterar Senha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

