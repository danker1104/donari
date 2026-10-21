// @ts-check

import { createHmac } from 'node:crypto';
import catalog from '../public/catalog/v1/catalog.json' with { type: 'json' };
import { normalizeNickname } from '../src/storage/localRepository.js';
import { calculateAccuracy, resultRank } from '../src/rules/scoreV1.js';
import { RULESET_VERSION } from '../src/rules/standardRules.js';

const boards = new Map(catalog.songs.flatMap((song) => song.difficulties.map((difficulty) => [
  `${song.id}:${difficulty.beatmapId}:${RULESET_VERSION}`, { songId: song.id, beatmapId: difficulty.beatmapId },
])));
const BODY_LIMIT = 8192;

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** @param {string} boardKey @param {any} body */
export function validateSubmission(boardKey, body) {
  const board = boards.get(boardKey);
  const result = body?.result;
  const nickname = normalizeNickname(body?.nickname);
  const counts = result?.judgements;
  if (!board || !nickname || !result || result.cleared !== true || result.profileMode === true
    || result.songId !== board.songId || result.beatmapId !== board.beatmapId || result.rulesetVersion !== RULESET_VERSION
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id ?? '')
    || !Number.isSafeInteger(result.score) || result.score < 0 || result.score > 1_000_000_000
    || !Number.isSafeInteger(result.maxCombo) || result.maxCombo < 0 || result.maxCombo > 100_000
    || !counts || ![300, 100, 50, 'miss'].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0 && counts[key] <= 100_000)) {
    throw new RequestError(400, '등록할 클리어 기록이 올바르지 않습니다.');
  }
  const total = counts[300] + counts[100] + counts[50] + counts.miss;
  if (total < 1 || total > 100_000 || result.maxCombo > total * 100) throw new RequestError(400, '판정 기록이 올바르지 않습니다.');
  return {
    p_board_key: boardKey, p_nickname: nickname, p_run_id: result.id,
    p_score: result.score, p_accuracy: calculateAccuracy(counts), p_max_combo: result.maxCombo, p_rank: resultRank(counts),
  };
}

/** @param {any} request */
async function readBody(request) {
  if (Number(request.headers['content-length'] ?? 0) > BODY_LIMIT) throw new RequestError(413, '등록 요청이 너무 큽니다.');
  let body = request.body;
  if (body === undefined) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > BODY_LIMIT) throw new RequestError(413, '등록 요청이 너무 큽니다.');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  try {
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') > BODY_LIMIT) throw new RequestError(413, '등록 요청이 너무 큽니다.');
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'JSON 요청 형식을 확인해 주세요.');
  }
}

/** @param {{env?:Record<string,string|undefined>,fetcher?:typeof fetch}} [options] */
export function createLeaderboardHandler({ env = process.env, fetcher = globalThis.fetch } = {}) {
  return async (/** @type {any} */ request, /** @type {any} */ response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (/** @type {number} */ status, /** @type {any} */ body) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    };
    try {
      if (!['GET', 'POST'].includes(request.method)) {
        response.setHeader('Allow', 'GET, POST');
        throw new RequestError(405, '지원하지 않는 요청 방식입니다.');
      }
      const url = new URL(request.url ?? '/', 'http://localhost');
      let params;
      let rpc = 'rhythm_get_leaderboard';
      if (request.method === 'POST') {
        if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new RequestError(403, '다른 사이트에서의 기록 등록은 허용되지 않습니다.');
        if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'JSON 요청만 지원합니다.');
        const body = await readBody(request);
        params = validateSubmission(body?.boardKey, body);
        rpc = 'rhythm_submit_leaderboard';
      } else {
        const boardKey = url.searchParams.get('boardKey') ?? '';
        if (!boards.has(boardKey)) throw new RequestError(400, '등록된 난이도를 선택해 주세요.');
        params = { p_board_key: boardKey };
      }
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new RequestError(503, '온라인 랭킹 DB가 아직 연결되지 않았습니다.');
      const databaseUrl = new URL(env.SUPABASE_URL);
      if (databaseUrl.protocol !== 'https:' || databaseUrl.username || databaseUrl.password) throw new RequestError(503, '온라인 랭킹 DB 설정을 확인해 주세요.');
      if (request.method === 'POST') {
        const forwarded = env.VERCEL ? request.headers['x-vercel-forwarded-for'] : null;
        const address = String(forwarded ?? request.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
        params.p_client_hash = createHmac('sha256', env.SUPABASE_SERVICE_ROLE_KEY).update(address).digest('hex');
      }
      let upstream;
      try {
        upstream = await fetcher(new URL(`/rest/v1/rpc/${rpc}`, databaseUrl), {
          method: 'POST',
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(params), signal: AbortSignal.timeout(8000),
        });
      } catch { throw new RequestError(502, '랭킹 DB에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
      let data;
      try { data = await upstream.json(); }
      catch { throw new RequestError(502, '랭킹 DB 응답을 확인하지 못했습니다.'); }
      if (!upstream.ok) {
        if (data?.message === 'RATE_LIMITED') { response.setHeader('Retry-After', '60'); throw new RequestError(429, '등록 요청이 많습니다. 1분 후 다시 시도해 주세요.'); }
        if (data?.code === '23505') throw new RequestError(409, '이미 등록한 플레이 기록입니다.');
        throw new RequestError(502, '랭킹 DB 설정 또는 테이블을 확인해 주세요.');
      }
      if (request.method === 'GET') {
        if (!Array.isArray(data)) throw new RequestError(502, '랭킹 DB 응답이 올바르지 않습니다.');
        send(200, { entries: data });
      } else {
        if (!data || !Array.isArray(data.entries) || typeof data.updated !== 'boolean') throw new RequestError(502, '등록 결과를 확인하지 못했습니다.');
        send(200, { ...data, persistent: true });
      }
    } catch (error) {
      send(error instanceof RequestError ? error.status : 500, { error: error instanceof RequestError ? error.message : '랭킹 요청을 처리하지 못했습니다.' });
    }
  };
}

export default createLeaderboardHandler();