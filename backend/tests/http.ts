import request from 'supertest';
import app from '../src/app';

/** Requisição simples ao app, sem abrir porta. */
export const api = () => request(app);

/**
 * Requisições autenticadas por Bearer token (sessão criada pelas factories).
 * Uso: `await como(token).get('/api/produtos')`.
 */
export function como(token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (caminho: string) => request(app).get(caminho).set(auth),
    post: (caminho: string) => request(app).post(caminho).set(auth),
    put: (caminho: string) => request(app).put(caminho).set(auth),
    delete: (caminho: string) => request(app).delete(caminho).set(auth),
  };
}
