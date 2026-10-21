// @ts-check

/**
 * @param {{initialize:()=>Promise<void>}} app
 * @param {{status:{textContent:string|null},startButton:{disabled:boolean,textContent:string|null},setRetry:(handler:null|(()=>Promise<boolean>))=>void}} elements
 */
export async function initializeApp(app, elements) {
  elements.startButton.disabled = true;
  elements.setRetry(null);
  try {
    await app.initialize();
    return true;
  } catch (error) {
    elements.status.textContent = `초기화 실패: ${error instanceof Error ? error.message : String(error)}`;
    elements.startButton.disabled = false;
    elements.startButton.textContent = '다시 시도';
    elements.setRetry(() => initializeApp(app, elements));
    return false;
  }
}
