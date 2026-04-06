import type { QueryClient, QueryKey } from '@tanstack/react-query';

export async function safeInvalidateQueries(
  queryClient: QueryClient,
  queryKey: QueryKey,
  label: string
) {
  try {
    await queryClient.invalidateQueries({ queryKey });
  } catch (error) {
    console.error(`[ReactQuery] Failed to invalidate ${label}:`, error instanceof Error ? error.message : String(error));
  }
}

export async function safeInvalidateMany(
  queryClient: QueryClient,
  invalidations: { queryKey: QueryKey; label: string }[]
) {
  await Promise.all(
    invalidations.map(({ queryKey, label }) => safeInvalidateQueries(queryClient, queryKey, label))
  );
}
