/**
 * Alterna determinísticamente el orden visual (Local primero vs Visitante primero) por partido
 * para evitar que siempre aparezca primero el visitante y luego el local sin causar parpadeos.
 */
export function shouldShowHomeFirst(matchId: string): boolean {
  let hash = 0;
  for (let i = 0; i < matchId.length; i += 1) {
    hash = (hash * 31 + matchId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 1;
}
