export function parsePagination(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function parseSort(query, allowed, fallback = '-createdAt') {
  const raw = String(query.sort || fallback);
  const field = raw.replace(/^-/, '');
  if (!allowed.includes(field)) return fallback;
  return raw;
}
