// @ts-check

import './styles.css';
import { CircleSliceApp } from './app/circleSliceApp.js';
import { initializeApp } from './app/initializeApp.js';
import { renderLayerProbe } from './renderer/renderLayerProbe.js';

const canvas = document.querySelector('#gameplay');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('GAMEPLAY_CANVAS_MISSING');
}

const context = canvas.getContext('2d');

if (!context) {
  throw new Error('CANVAS_2D_UNAVAILABLE');
}

const select = document.querySelector('#difficulty-select');
const startButton = document.querySelector('#start-button');
const status = document.querySelector('#stage-status');
const menuPanel = document.querySelector('#menu-panel');
const stats = document.querySelector('#difficulty-stats');
const dialog = document.querySelector('#flow-dialog');
if (!(select instanceof HTMLSelectElement) || !(startButton instanceof HTMLButtonElement) || !(status instanceof HTMLElement)
  || !(menuPanel instanceof HTMLElement) || !(stats instanceof HTMLElement) || !(dialog instanceof HTMLElement) || typeof /** @type {any} */ (dialog).showModal !== 'function') {
  throw new Error('APP_CONTROLS_MISSING');
}

context.fillStyle = '#090713';
context.fillRect(0, 0, canvas.width, canvas.height);

const app = new CircleSliceApp({ canvas, select, startButton, status, menuPanel, stats, dialog: /** @type {HTMLDialogElement} */ (dialog) });
void initializeApp(app, {
  status,
  startButton,
  setRetry: (handler) => { startButton.onclick = handler ? () => { void handler(); } : null; },
}).then((ready) => {
  if (ready && new URL(window.location.href).searchParams.get('probe') === 'layers') {
    renderLayerProbe(context, canvas.width, canvas.height);
  }
});
