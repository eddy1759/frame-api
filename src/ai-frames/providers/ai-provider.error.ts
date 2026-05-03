export class AiProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}
