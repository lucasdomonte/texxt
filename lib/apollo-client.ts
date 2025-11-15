'use client';

import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// HTTP link para todas as operações (queries, mutations e subscriptions via polling)
// Na Vercel, subscriptions via WebSocket não funcionam nativamente
// Usaremos polling automático para subscriptions
const httpLink = createHttpLink({
  uri: '/api/graphql',
});

// Link para adicionar headers com userId e token de sessão
const authLink = setContext((_, { headers }) => {
  // Obter userId do localStorage
  const userId = typeof window !== 'undefined' ? localStorage.getItem('texxt_user_id') || '' : '';
  
  // Obter token de sessão do documento atual da URL
  let docToken = '';
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    const docPath = pathname === '/' ? 'home' : pathname.slice(1);
    const storageKey = `doc_session_${docPath}`;
    docToken = localStorage.getItem(storageKey) || '';
    
    // Log para debug (remover depois)
    if (docToken) {
      console.log('Token encontrado no localStorage:', {
        path: docPath,
        storageKey,
        tokenPresent: !!docToken,
        userId,
      });
    }
  }
  
  return {
    headers: {
      ...headers,
      'x-user-id': userId,
      'x-doc-token': docToken,
    },
  };
});

export const client = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
    query: {
      fetchPolicy: 'cache-and-network',
    },
  },
});

