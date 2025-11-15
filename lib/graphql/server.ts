import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

// Desabilitar incremental delivery polyfill para evitar conflito com GraphQL 16
// @ts-ignore
if (typeof process !== 'undefined' && process.env) {
  // @ts-ignore
  process.env.APOLLO_SERVER_DISABLE_INCREMENTAL_DELIVERY = 'true';
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
});

export const handler = startServerAndCreateNextHandler(server, {
  context: async (req) => {
    // Garantir que os headers sejam acessíveis em diferentes formatos
    const headers = req.headers || {};
    
    // Log para debug (remover depois)
    if (headers['x-user-id'] || headers['x-doc-token']) {
      console.log('Headers recebidos:', {
        'x-user-id': headers['x-user-id'],
        'x-doc-token': headers['x-doc-token'] ? 'presente' : 'ausente',
      });
    }
    
    return { req };
  },
});

