// @ts-check

import { createElement, Trophy, X, Send, RotateCw } from 'lucide';
import { normalizeNickname } from '../storage/localRepository.js';

/** @param {string} tag @param {string} [text] @param {string} [className] */
function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

export class LeaderboardPresentation {
  /** @param {import('../storage/leaderboardRepository.js').OnlineLeaderboardRepository} repository @param {number} rulesetVersion */
  constructor(repository, rulesetVersion) {
    this.repository = repository;
    this.rulesetVersion = rulesetVersion;
    this.dialog = /** @type {HTMLDialogElement} */ (document.getElementById('leaderboard-dialog'));
    this.select = /** @type {HTMLSelectElement} */ (document.getElementById('leaderboard-difficulty'));
    this.host = /** @type {HTMLElement} */ (document.getElementById('leaderboard-records'));
    this.song = null;
    this.resultHost = null;
    this.resultDifficulty = null;
    this.highlightId = null;
    this.requests = new WeakMap();
    document.getElementById('leaderboard-button')?.prepend(createElement(Trophy, { 'aria-hidden': 'true' }));
    const close = document.getElementById('leaderboard-close');
    close?.append(createElement(X, { 'aria-hidden': 'true' }));
    close?.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.dialog.close();
    });
    this.select.addEventListener('change', () => this.renderCurrent());
  }

  /** @param {any} song */
  initialize(song) {
    this.song = song;
    this.select.replaceChildren(...song.difficulties.map((/** @type {any} */ difficulty) => {
      const option = document.createElement('option');
      option.value = difficulty.id;
      option.textContent = difficulty.label;
      return option;
    }));
    const title = document.getElementById('leaderboard-song');
    if (title) title.textContent = `${song.artist} · ${song.title}`;
    const button = /** @type {HTMLButtonElement|null} */ (document.getElementById('leaderboard-button'));
    if (button) button.disabled = false;
  }

  /** @param {string} difficultyId */
  open(difficultyId) {
    if (!this.song) return;
    this.select.value = difficultyId;
    this.renderCurrent();
    if (!this.dialog.open) this.dialog.showModal();
    this.select.focus();
  }

  /** @param {any} difficulty */
  key(difficulty) { return `${this.song.id}:${difficulty.beatmapId}:${this.rulesetVersion}`; }

  renderCurrent() {
    const difficulty = this.song?.difficulties.find((/** @type {any} */ entry) => entry.id === this.select.value);
    if (difficulty) this.renderBoard(this.host, difficulty);
  }

  /** @param {HTMLElement} host @param {any} difficulty @param {string|null} [highlightId] */
  async renderBoard(host, difficulty, highlightId = null) {
    const generation = (this.requests.get(host) ?? 0) + 1;
    this.requests.set(host, generation);
    host.replaceChildren(element('p', '랭킹을 불러오는 중…', 'leaderboard-message'));
    try {
      const entries = await this.repository.getLeaderboard(this.key(difficulty));
      if (this.requests.get(host) !== generation) return;
      this.renderEntries(host, difficulty, entries, highlightId);
    } catch (error) {
      if (this.requests.get(host) !== generation) return;
      const message = element('div', '', 'leaderboard-message');
      message.setAttribute('role', 'status');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'leaderboard-button';
      retry.append(createElement(RotateCw, { 'aria-hidden': 'true' }), document.createTextNode('다시 시도'));
      retry.addEventListener('click', () => { void this.renderBoard(host, difficulty, highlightId); });
      message.append(element('p', error instanceof Error ? error.message : '랭킹을 불러오지 못했습니다.'), retry);
      host.replaceChildren(message);
    }
  }

  /** @param {HTMLElement} host @param {any} difficulty @param {Array<any>} entries @param {string|null} [highlightId] */
  renderEntries(host, difficulty, entries, highlightId = null) {
    const table = document.createElement('table');
    table.className = 'leaderboard-table';
    table.append(element('caption', `${difficulty.label} · 온라인 · 상위 ${entries.length}명`));
    const head = table.createTHead().insertRow();
    for (const label of ['순위', '닉네임', '등급', '점수']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      head.append(cell);
    }
    const body = table.createTBody();
    entries.forEach((entry, index) => {
      const row = body.insertRow();
      if (entry.id === highlightId) { row.className = 'is-current-record'; row.setAttribute('aria-current', 'true'); }
      row.insertCell().append(element('span', String(index + 1), index < 3 ? 'ranking-place is-podium' : 'ranking-place'));
      row.insertCell().append(element('span', entry.nickname, 'ranking-nickname'));
      row.insertCell().append(element('span', entry.rank, `ranking-grade grade-${entry.rank}`));
      row.insertCell().textContent = new Intl.NumberFormat('ko-KR').format(entry.score);
    });
    if (entries.length === 0) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 4;
      cell.className = 'leaderboard-empty';
      cell.textContent = '아직 등록된 기록이 없습니다.';
    }
    host.replaceChildren(table);
  }

  /** @param {any} result @param {boolean} eligible */
  createResultBoard(result, eligible) {
    const section = element('section', '', 'result-leaderboard');
    section.setAttribute('aria-label', '클리어 난이도 랭킹');
    const heading = element('div', '', 'leaderboard-result-heading');
    heading.append(element('h3', '난이도 랭킹'), element('span', '온라인', 'leaderboard-scope'));
    section.append(heading);
    const difficulty = this.song.difficulties.find((/** @type {any} */ entry) => entry.beatmapId === result.beatmapId);
    const host = element('div', '', 'leaderboard-scroll');
    this.resultHost = host;
    this.resultDifficulty = difficulty;
    this.highlightId = null;
    if (eligible) {
      const form = document.createElement('form');
      form.className = 'ranking-submit';
      const label = document.createElement('label');
      label.htmlFor = 'ranking-nickname';
      label.textContent = '닉네임';
      const input = document.createElement('input');
      input.id = 'ranking-nickname';
      input.name = 'nickname';
      input.required = true;
      input.maxLength = 16;
      input.autocomplete = 'nickname';
      input.value = this.repository.loadNickname();
      input.setAttribute('aria-describedby', 'ranking-submit-status');
      const button = document.createElement('button');
      button.type = 'submit';
      button.append(createElement(Send, { 'aria-hidden': 'true' }), document.createTextNode('기록 등록'));
      const status = element('p', '', 'ranking-submit-status');
      status.id = 'ranking-submit-status';
      status.setAttribute('role', 'status');
      form.append(label, input, button, status);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (button.disabled) return;
        const nickname = normalizeNickname(input.value);
        input.setCustomValidity(nickname ? '' : '닉네임을 입력해 주세요.');
        if (!input.reportValidity()) return;
        button.disabled = true;
        input.disabled = true;
        status.textContent = 'DB에 기록을 저장하는 중…';
        try {
          const saved = await this.repository.submitRanking(this.key(difficulty), nickname, result);
          input.value = nickname;
          input.disabled = true;
          button.disabled = true;
          button.replaceChildren(createElement(Trophy, { 'aria-hidden': 'true' }), document.createTextNode('등록 완료'));
          this.highlightId = result.id;
          this.requests.set(host, (this.requests.get(host) ?? 0) + 1);
          this.renderEntries(host, difficulty, saved.entries, result.id);
          const position = saved.entries.findIndex((entry) => entry.id === result.id);
          status.textContent = position >= 0 ? `${position + 1}위에 등록되었습니다.`
            : saved.updated ? 'DB에 저장되었습니다. 상위 100위 밖의 기록입니다.'
            : saved.entries.some((entry) => entry.nickname.toLocaleLowerCase('en-US') === nickname.toLocaleLowerCase('en-US'))
              ? '기존 최고 기록을 유지했습니다.' : '상위 100위 밖의 기록입니다.';
          if (this.dialog.open) this.renderCurrent();
        } catch (error) {
          input.disabled = false;
          button.disabled = false;
          status.textContent = error instanceof Error ? error.message : '기록을 등록하지 못했습니다. 다시 시도해 주세요.';
        }
      });
      input.addEventListener('input', () => input.setCustomValidity(''));
      section.append(form);
    } else section.append(element('p', '측정 모드 기록 · 랭킹 등록 제외', 'ranking-submit-status'));
    this.renderBoard(host, difficulty);
    section.append(host);
    return section;
  }
}