import axios from 'axios';
import { decryptSecret } from '../../utils/crypto.js';
import { EmailConnection } from '../../models/EmailConnection.js';

const BASE_URL = 'https://api.brevo.com/v3';

export function createBrevoClient(apiKey) {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  client.interceptors.response.use(
    (r) => r,
    (err) => {
      const detail = err.response?.data?.message || err.message;
      const e = new Error(`Brevo API error: ${detail}`);
      e.status = err.response?.status;
      e.brevoCode = err.response?.data?.code;
      throw e;
    }
  );
  return client;
}

export async function getBrevoClientForWorkspace(workspaceId) {
  const conn = await EmailConnection.findOne({ workspaceId, provider: 'brevo', status: { $ne: 'disconnected' } }).select('+apiKeyEnc');
  if (!conn) {
    const e = new Error('Brevo is not connected for this workspace.');
    e.code = 'BREVO_NOT_CONNECTED';
    e.statusCode = 400;
    throw e;
  }
  const apiKey = decryptSecret(conn.apiKeyEnc);
  return { client: createBrevoClient(apiKey), connection: conn };
}
