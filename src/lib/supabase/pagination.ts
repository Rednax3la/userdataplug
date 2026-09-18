/** Read until an empty page, including when the server caps pages below our request. */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  const pageSize = 1000;
  while (true) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    // Never let a later-page failure produce a successful, incomplete export.
    if (error) return { data: [], error };
    if (!data?.length) return { data: rows, error: null };
    rows.push(...data);
  }
}