// Same id as the old Studio used, so run history and the rolling window
// carry over to the new UI.
export function getUid(): string {
  try {
    let u = localStorage.getItem('insight_extractor_uid') || localStorage.getItem('askcard_uid') || '';
    if (!u) {
      u = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('insight_extractor_uid', u);
    }
    return u;
  } catch {
    return 'local';
  }
}
