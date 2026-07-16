import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_IMPORT = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/csv', 'text/plain'];

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okType = ALLOWED_IMPORT.includes(file.mimetype) || /\.(csv|xlsx|xls)$/i.test(file.originalname);
    if (!okType) return cb(ApiError.badRequest('Only CSV or Excel files are allowed.', 'INVALID_FILE_TYPE'));
    cb(null, true);
  },
});

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const banned = /\.(exe|bat|cmd|sh|js|msi|dll|scr)$/i;
    if (banned.test(file.originalname)) return cb(ApiError.badRequest('This file type is not allowed.', 'INVALID_FILE_TYPE'));
    cb(null, true);
  },
});
