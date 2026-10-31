// Seed only the in-memory preview database; the production Firebase SDK is never loaded.
window.__role = 'santi';
sessionStorage.removeItem('__fakeFirebase');
const previewSessions = {};
const previewDays = {};
for (let day = 1; day <= 30; day++) {
  const endedAt = new Date(2026, 9, day, 17).getTime();
  previewSessions['sample' + day] = { endedAt, elapsedSeconds: 24000, categoryKey: 'school' };
  previewDays[`2026-10-${String(day).padStart(2, '0')}`] = { seconds: 24000 };
}
window.__seedDb = {
  sessions: { santi: previewSessions },
  categories: { santi: { school: { label: 'school !', color: '#cb7950', lastUsedAt: Date.now() } } },
  room: { kristina: { running: false, status: { text: 'having a break', setAt: Date.now() } } },
};
window.addEventListener('message', event => {
  const frame = document.getElementById('cottagePreview');
  if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.type === 'cottage-height') {
    frame.style.height = Math.min(1400, Math.max(200, Number(event.data.height) || 400)) + 'px';
  }
});
