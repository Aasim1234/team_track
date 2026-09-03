// PostgREST caps any single response at 1000 rows, and it does so silently —
// no error, the extra rows just never arrive. Several tables here are already
// well past that (test_cases, test_run_cases, test_results), which made whole
// sections render as empty. Any list query that can outgrow 1000 rows has to
// page through with .range() instead of being awaited directly.
//
// Pass a factory, not a query: Supabase query builders are single-use, so each
// page needs a freshly built one.
//
//   const { data, error } = await fetchAllRows(() =>
//     supabase.from('test_cases').select('*').eq('project_id', id).order('id'))
//
// Order by something unique (or add .order('id') as a tiebreaker). Bulk imports
// give thousands of rows an identical created_at, and an unstable sort lets
// pages overlap — duplicating some rows and dropping others.
const PAGE_SIZE = 1000

export async function fetchAllRows(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
