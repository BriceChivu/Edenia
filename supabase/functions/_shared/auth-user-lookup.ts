import { normalizeCheckoutEmail } from './checkout-identity.ts'

export const AUTH_USER_PAGE_SIZE = 1_000

export type AuthUserLookupEntry = {
  id: string
  email?: string | null
}

export type AuthUserLookupPage = {
  users: AuthUserLookupEntry[]
}

export type ListAuthUsersPage = (params: {
  page: number
  perPage: number
}) => Promise<AuthUserLookupPage>

export async function findAuthUserByEmail(
  email: string,
  listUsersPage: ListAuthUsersPage,
  pageSize = AUTH_USER_PAGE_SIZE,
) {
  const normalizedEmail = normalizeCheckoutEmail(email)
  if (!normalizedEmail) throw new Error('Cannot look up a malformed email address')
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Auth user page size must be a positive integer')
  }

  for (let page = 1; ; page += 1) {
    const { users } = await listUsersPage({ page, perPage: pageSize })
    const match = users.find(
      user => normalizeCheckoutEmail(user.email) === normalizedEmail,
    )

    if (match) return match
    if (users.length < pageSize) return null
  }
}
