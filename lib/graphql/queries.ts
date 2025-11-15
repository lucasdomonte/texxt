import { gql } from '@apollo/client';

export const GET_DOC = gql`
  query GetDoc($path: String!) {
    doc(path: $path) {
      path
      text
      updatedAt
      requiresPassword
      requiresReadPassword
      hasPassword
      isHome
      formatType
      locked
      isBlocked
      blockedReason
      blockedAt
    }
  }
`;

export const GET_RELATED_DOCS = gql`
  query GetRelatedDocs($path: String!) {
    relatedDocs(path: $path) {
      path
      updatedAt
    }
  }
`;

export const DOC_UPDATED_SUBSCRIPTION = gql`
  subscription DocUpdated($path: String!) {
    docUpdated(path: $path) {
      path
      text
      updatedAt
      formatType
      requiresPassword
      requiresReadPassword
      hasPassword
      isHome
      locked
      isBlocked
    }
  }
`;

export const SAVE_DOC = gql`
  mutation SaveDoc($path: String!, $text: String!, $password: String, $formatType: String) {
    saveDoc(path: $path, text: $text, password: $password, formatType: $formatType) {
      path
      text
      updatedAt
      formatType
      requiresPassword
      requiresReadPassword
      hasPassword
      isHome
      locked
    }
  }
`;

export const UNLOCK_DOC = gql`
  mutation UnlockDoc($path: String!, $password: String!, $userId: String!) {
    unlockDoc(path: $path, password: $password, userId: $userId) {
      path
      text
      updatedAt
      requiresPassword
      requiresReadPassword
      hasPassword
      isHome
      locked
      formatType
      sessionToken
    }
  }
`;

export const SET_DOC_ACCESS = gql`
  mutation SetDocAccess(
    $path: String!
    $password: String
    $requiresPassword: Boolean!
    $requiresReadPassword: Boolean!
    $currentPassword: String
  ) {
    setDocAccess(
      path: $path
      password: $password
      requiresPassword: $requiresPassword
      requiresReadPassword: $requiresReadPassword
      currentPassword: $currentPassword
    )
  }
`;

export const ADMIN_LOGIN = gql`
  mutation AdminLogin($password: String!) {
    adminLogin(password: $password)
  }
`;

export const ADMIN_DOCS = gql`
  query AdminDocs {
    adminDocs {
      path
      updatedAt
      isBlocked
      blockedReason
      blockedAt
      uniquePageviews
      totalPageviews
      requiresPassword
      requiresReadPassword
    }
  }
`;

export const ADMIN_BLOCK_DOC = gql`
  mutation AdminBlockDoc($path: String!, $reason: String) {
    adminBlockDoc(path: $path, reason: $reason)
  }
`;

export const ADMIN_UNBLOCK_DOC = gql`
  mutation AdminUnblockDoc($path: String!) {
    adminUnblockDoc(path: $path)
  }
`;

export const ADMIN_CHANGE_PASSWORD = gql`
  mutation AdminChangePassword($currentPassword: String!, $newPassword: String!) {
    adminChangePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const ADMIN_CHANGE_DOC_PASSWORD_ADMIN = gql`
  mutation AdminChangeDocPasswordAdmin($path: String!, $newPassword: String!) {
    adminChangeDocPasswordAdmin(path: $path, newPassword: $newPassword)
  }
`;

export const GET_ACTIVE_USER_COUNT = gql`
  query GetActiveUserCount($path: String!) {
    activeUserCount(path: $path)
  }
`;

export const REGISTER_ACTIVE_USER = gql`
  mutation RegisterActiveUser($path: String!, $userId: String!) {
    registerActiveUser(path: $path, userId: $userId)
  }
`;

export const UNREGISTER_ACTIVE_USER = gql`
  mutation UnregisterActiveUser($path: String!, $userId: String!) {
    unregisterActiveUser(path: $path, userId: $userId)
  }
`;

