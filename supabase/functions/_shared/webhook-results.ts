export type DependencyError = {
  code?: string
  message: string
}

export type DependencyResult<T> =
  | { data: T; error: null }
  | { data: unknown; error: DependencyError }

type SuccessfulDependencyData<TResult> = TResult extends {
  data: infer TData
  error: null
} ? TData
  : never

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

export function requireDependencySuccess<
  TResult extends { data: unknown; error: DependencyError | null },
>(
  result: TResult,
  operation: string,
): SuccessfulDependencyData<TResult> {
  if (result.error) {
    throw new WebhookDependencyError(
      operation,
      result.error.message,
      result.error.code,
    )
  }
  return result.data as SuccessfulDependencyData<TResult>
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
