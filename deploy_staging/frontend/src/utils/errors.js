export function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
