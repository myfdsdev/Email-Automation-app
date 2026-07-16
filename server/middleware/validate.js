import { ApiError } from '../utils/ApiError.js';

/** Zod validation middleware: validate({ body, query, params }). */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) {
        const result = schemas[key].safeParse(req[key]);
        if (!result.success) {
          const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
          return next(ApiError.badRequest('Validation failed.', 'VALIDATION_ERROR', details));
        }
        if (key === 'body') req.body = result.data;
        else Object.assign(req[key], result.data);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};
