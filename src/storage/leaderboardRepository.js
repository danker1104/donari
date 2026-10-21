// @ts-check

import { NICKNAME_KEY, normalizeNickname } from './localRepository.js';

export class OnlineLeaderboardRepository {
  /** @param {import('./localRepository.js').LocalRepository} local @param {typeof fetch} [fetcher] */
  constructor(local, fetcher = globalThis.fetch.bind(globalThis)) {
    this.local = local;
    this.fetcher = fetcher;
  }

  loadNickname() { return this.local.loadNickname(); }

  /** @param {string} key */
  getBestResult(key) { return this.local.getBestResult(key); }

  /** @param {string} key */
  async getLeaderboard(key) {
    const data = await this.request(`/api/leaderboard?boardKey=${encodeURIComponent(key)}`);
    return data.entries;
  }

  /** @param {string} key @param {unknown} nickname @param {any} result */
  async submitRanking(key, nickname, result) {
    const name = normalizeNickname(nickname);
    const data = await this.request('/api/leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardKey: key, nickname: name, result }),
    });
    if (typeof data.updated !== 'boolean' || data.persistent !== true) throw new Error('DB 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
    this.local.write(NICKNAME_KEY, name);
    return data;
  }

  /** @param {string} url @param {RequestInit} [options] */
  async request(url, options = {}) {
    let response;
    try { response = await this.fetcher(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
    catch { throw new Error('랭킹 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('랭킹 서버 응답을 확인하지 못했습니다.'); }
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : '랭킹 요청을 처리하지 못했습니다.');
    if (!Array.isArray(data?.entries)) throw new Error('랭킹 서버 응답이 올바르지 않습니다.');
    return data;
  }
}
