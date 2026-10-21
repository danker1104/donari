import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeaderboardHandler, validateSubmission } from '../api/leaderboard.js';

const boardKey = 'silhouette-399358:892534:5';
const result = { id: 'ca77a729-e70a-4cee-8772-7ce54a1d6690', songId: 'silhouette-399358', beatmapId: 892534, rulesetVersion: 5,
  cleared: true, score: 30000, maxCombo: 100, accuracy: 0, rank: 'D', judgements: { 300: 100, 100: 0, 50: 0, miss: 0 } };
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret' };
async function invoke(options = {}, request = {}) {
  const headers = {};
  const response = { statusCode: 200, setHeader: (key, value) => { headers[key] = value; }, end: (value) => { response.body = JSON.parse(value); } };
  await createLeaderboardHandler(options)({ method: 'GET', url: `/api/leaderboard?boardKey=${boardKey}`, headers: {}, ...request }, response);
  return { status: response.statusCode, body: response.body, headers };
}

test('API reports missing database instead of pretending a save succeeded', async () => {
  const response = await invoke({ env: {} });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /연결되지/);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('API reads an allowed board and keeps service credentials on the server', async () => {
  let outgoing;
  const response = await invoke({ env, fetcher: async (url, options) => { outgoing = { url: String(url), ...options }; return Response.json([]); } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.entries, []);
  assert.equal(outgoing.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(JSON.stringify(response.body).includes('test-server-secret'), false);
  assert.equal(JSON.parse(outgoing.body).p_board_key, boardKey);
});

test('submission validates identity and recomputes rank and accuracy from judgements', () => {
  const params = validateSubmission(boardKey, { nickname: '  Ａ  ', result });
  assert.equal(params.p_nickname, 'A');
  assert.equal(params.p_rank, 'SS');
  assert.equal(params.p_accuracy, 1);
  for (const changed of [{ cleared: false }, { profileMode: true }, { score: -1 }, { score: 1e20 }, { id: 'bad' }, { beatmapId: 1 }, { judgements: { 300: 0, 100: 0, 50: 0, miss: 0 } }]) {
    assert.throws(() => validateSubmission(boardKey, { nickname: 'Name', result: { ...result, ...changed } }));
  }
});

test('POST delegates atomic writes and hashes the client address', async () => {
  let params;
  const response = await invoke({ env, fetcher: async (url, options) => { params = JSON.parse(options.body); return Response.json({ entries: [], updated: true }); } },
    { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:5173', origin: 'http://localhost:5173' }, body: { boardKey, nickname: 'Name', result }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.persistent, true);
  assert.match(params.p_client_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(params).includes('127.0.0.1'), false);
});

test('invalid method, unknown board, cross-site POST and oversized bodies are rejected', async () => {
  assert.equal((await invoke({ env }, { method: 'DELETE' })).status, 405);
  assert.equal((await invoke({ env }, { url: '/?boardKey=unknown' })).status, 400);
  assert.equal((await invoke({ env }, { method: 'POST', headers: { origin: 'https://evil.test', host: 'localhost' } })).status, 403);
  assert.equal((await invoke({ env }, { method: 'POST', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await invoke({ env }, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '9000' } })).status, 413);
});

test('database errors and timeouts are sanitized and rate limits use 429', async () => {
  const rate = await invoke({ env, fetcher: async () => Response.json({ message: 'RATE_LIMITED' }, { status: 400 }) });
  assert.equal(rate.status, 429);
  const error = await invoke({ env, fetcher: async () => Response.json({ message: 'test-server-secret SQL details' }, { status: 500 }) });
  assert.equal(error.status, 502);
  assert.equal(JSON.stringify(error.body).includes('test-server-secret'), false);
  assert.equal((await invoke({ env, fetcher: async () => { throw new Error('network'); } })).status, 502);
});