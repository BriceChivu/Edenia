import assert from 'node:assert/strict'
import test from 'node:test'

import { findAuthUserByEmail } from './auth-user-lookup.ts'

test('finds a normalized email beyond the first page', async () => {
  const requests: Array<{ page: number; perPage: number }> = []
  const pages = [
    {
      users: [
        { id: 'user_1', email: 'first@example.com' },
        { id: 'user_2', email: 'second@example.com' },
      ],
    },
    {
      users: [
        { id: 'user_3', email: 'third@example.com' },
        { id: 'user_target', email: 'Learner@Example.COM' },
      ],
    },
  ]

  const match = await findAuthUserByEmail(
    ' learner@example.com ',
    async params => {
      requests.push(params)
      return pages[params.page - 1]
    },
    2,
  )

  assert.equal(match?.id, 'user_target')
  assert.deepEqual(requests, [
    { page: 1, perPage: 2 },
    { page: 2, perPage: 2 },
  ])
})

test('stops after the final short page when no user matches', async () => {
  const requestedPages: number[] = []
  const pages = [
    {
      users: [
        { id: 'user_1', email: 'first@example.com' },
        { id: 'user_2', email: null },
      ],
    },
    {
      users: [{ id: 'user_3', email: 'third@example.com' }],
    },
  ]

  const match = await findAuthUserByEmail(
    'missing@example.com',
    async ({ page }) => {
      requestedPages.push(page)
      return pages[page - 1]
    },
    2,
  )

  assert.equal(match, null)
  assert.deepEqual(requestedPages, [1, 2])
})

test('does not request later pages after finding a match', async () => {
  let pageRequests = 0

  const match = await findAuthUserByEmail(
    'first@example.com',
    async () => {
      pageRequests += 1
      return {
        users: [
          { id: 'user_target', email: 'first@example.com' },
          { id: 'user_2', email: 'second@example.com' },
        ],
      }
    },
    2,
  )

  assert.equal(match?.id, 'user_target')
  assert.equal(pageRequests, 1)
})

test('rejects malformed lookup emails and invalid page sizes', async () => {
  const listUsersPage = async () => ({ users: [] })

  await assert.rejects(
    findAuthUserByEmail('not-an-email', listUsersPage),
    /malformed email/,
  )
  await assert.rejects(
    findAuthUserByEmail('learner@example.com', listUsersPage, 0),
    /positive integer/,
  )
})
