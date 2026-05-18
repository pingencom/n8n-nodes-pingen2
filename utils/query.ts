import type { IExecuteFunctions } from 'n8n-workflow';

export function buildQueryString(ctx: IExecuteFunctions, i: number): string {
  const parts: string[] = [];
  const page = ctx.getNodeParameter('pageNumber', i, 0) as number;
  const size = ctx.getNodeParameter('pageSize', i, 0) as number;
  const sort = (ctx.getNodeParameter('sort', i, '') as string).trim();
  const filtersRaw = ctx.getNodeParameter('filters', i, {}) as {
    filter?: Array<{ key: string; value: string }>;
  };

  if (page > 0) {
    parts.push(`page[number]=${page}`);
  }
  if (size > 0) {
    parts.push(`page[size]=${size}`);
  }
  if (sort) {
    const sortValue = sort
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(encodeURIComponent)
      .join(',');
    if (sortValue) {
      parts.push(`sort=${sortValue}`);
    }
  }
  for (const f of filtersRaw.filter ?? []) {
    if (f.key && f.value != null) {
      parts.push(`filter[${encodeURIComponent(f.key)}]=${encodeURIComponent(f.value)}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
