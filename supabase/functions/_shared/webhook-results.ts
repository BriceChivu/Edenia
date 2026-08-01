export type DependencyError = {
  code?: string
  message: string
}

export type DependencyResult<T> = {
  data: T
  error: DependencyError | null
}

export class WebhookDependencyError extends Error {
  code?: string
  operation: string

  constructor(operation: string, message: string, code?: string) {
    super(`${operation}: ${message}`)
    this.name = 'WebhookDependencyError'
    this.operation = operation
    this.code = code
  }
}

export function requireDependencySuccess<T>(
  result: DependencyResult<T>,
  operation: string,
) {
  if (result.error) {
    throw new WebhookDependencyError(
      operation,
      result.error.message,
      result.error.code,
    )
  }
  return result.data
}

export function requireAffectedRows<T>(
  result: DependencyResult<T[] | null>,
  operation: string,
) {
  const rows = requireDependencySuccess(result, operation)
  if (!rows?.length) {
    throw new WebhookDependencyError(operation, 'no matching subscription row')
  }
  return rows
}

export function isUniqueViolation(error: DependencyError | null) {
  return error?.code === '23505'
}
