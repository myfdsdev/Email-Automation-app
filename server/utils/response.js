export function ok(res, data = {}, message = undefined, status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function created(res, data = {}, message = 'Created') {
  return ok(res, data, message, 201);
}

export function paginated(res, { items, total, page, limit }) {
  return res.status(200).json({
    success: true,
    data: {
      items,
      pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
}
