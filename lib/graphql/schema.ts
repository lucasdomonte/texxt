export const typeDefs = `#graphql
  type Doc {
    path: String!
    text: String!
    updatedAt: Int!
    requiresPassword: Boolean!
    requiresReadPassword: Boolean!
    hasPassword: Boolean!
    isHome: Boolean!
    formatType: String!
    locked: Boolean!
    isBlocked: Boolean
    blockedReason: String
    blockedAt: Int
    uniquePageviews: Int
    totalPageviews: Int
    sessionToken: String
  }

  type RelatedDoc {
    path: String!
    updatedAt: Int!
  }

  type AdminDoc {
    path: String!
    updatedAt: Int!
    isBlocked: Boolean!
    blockedReason: String
    blockedAt: Int
    uniquePageviews: Int!
    totalPageviews: Int!
    requiresPassword: Boolean!
    requiresReadPassword: Boolean!
  }

  type Query {
    doc(path: String!): Doc
    relatedDocs(path: String!): [RelatedDoc!]!
    adminDocs: [AdminDoc!]!
    activeUserCount(path: String!): Int!
  }

  type Mutation {
    saveDoc(
      path: String!
      text: String!
      password: String
      formatType: String
    ): Doc!
    
    unlockDoc(
      path: String!
      password: String!
      userId: String!
    ): Doc!
    
    setDocAccess(
      path: String!
      password: String
      requiresPassword: Boolean!
      requiresReadPassword: Boolean!
      currentPassword: String
    ): Boolean!
    
    adminLogin(password: String!): String!
    
    adminChangePassword(
      currentPassword: String!
      newPassword: String!
    ): Boolean!
    
    adminChangeDocPassword(
      path: String!
      currentPassword: String!
      newPassword: String!
    ): Boolean!
    
    adminChangeDocPasswordAdmin(
      path: String!
      newPassword: String!
    ): Boolean!
    
    adminBlockDoc(
      path: String!
      reason: String
    ): Boolean!
    
    adminUnblockDoc(
      path: String!
    ): Boolean!
    
    registerActiveUser(path: String!, userId: String!): Int!
    unregisterActiveUser(path: String!, userId: String!): Int!
  }

  type Subscription {
    docUpdated(path: String!): Doc!
  }
`;

