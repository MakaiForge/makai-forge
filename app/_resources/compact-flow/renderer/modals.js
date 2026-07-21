function show(view) {
  [emptyState, analyzing, result].forEach(el => el.classList.add('hidden'));
  if (view) view.classList.remove('hidden');
}

function showSuccess(title, msg) {
  successIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
  successIcon.style.stroke = '#22c55e';
  successModalTitle.textContent = 'Instalação concluída';
  successTitle.textContent = title;
  successMessage.textContent = msg;
  successClose.style.display = '';
  const oldBtn = document.querySelector('.modal-success .btn-finalize');
  if (oldBtn) oldBtn.remove();
  successModal.classList.remove('hidden');
}

function showProgress(title, msg) {
  progressTitle.textContent = title;
  progressMessage.textContent = msg;
  progressLog.textContent = '';
  progressModal.classList.remove('hidden');
}

function showError(title, msg) {
  successIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  successIcon.style.stroke = '#ef4444';
  successModalTitle.textContent = 'Erro';
  successTitle.textContent = title;
  successMessage.textContent = msg;
  successModal.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const tierColorMap = {
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  experimental: '#a855f7',
};

function ratingColor(score) {
  if (score >= 85) return '#22c55e';
  if (score >= 65) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

const rankingOrder = { gold: 0, silver: 1, bronze: 2, experimental: 3 };

function findForkForName(name, forkMap) {
  if (!forkMap || !name) return null;
  const lower = name.toLowerCase();
  if (forkMap[lower]) return forkMap[lower];

  const nameTokens = lower.split(/[\s-]+/).filter(Boolean);
  let best = null, bestScore = -Infinity;

  for (const [id, fork] of Object.entries(forkMap)) {
    const forkName = fork.name || id;
    if (lower === forkName.toLowerCase()) return fork;
    if (lower === id.toLowerCase()) return fork;

    const forkTokens = forkName.toLowerCase().split(/[\s-]+/).filter(Boolean);
    const overlap = nameTokens.filter(t => forkTokens.includes(t)).length;
    if (overlap === 0) continue;

    const sizeDiff = Math.abs(nameTokens.length - forkTokens.length);
    const score = overlap - sizeDiff * 0.5;
    if (score > bestScore) { bestScore = score; best = fork; }
  }

  if (best) return best;

  for (const [id, fork] of Object.entries(forkMap)) {
    const forkLower = (fork.name || id).toLowerCase();
    if (lower.includes(forkLower) || forkLower.includes(lower)) return fork;
    if (lower.includes(id)) return fork;
  }
  return null;
}

function rankingSortKey(group, forkMap) {
  const f = findForkForName(group.name, forkMap) || forkMap[group.toolId];
  return f ? (rankingOrder[f.ranking] ?? 4) : 4;
}

function confidencePercent(level) {
  const map = { high: 90, medium: 65, low: 35 };
  return map[level] || 50;
}

function confidenceColor(level) {
  const map = { high: '#22c55e', medium: '#eab308', low: '#ef4444' };
  return map[level] || '#a855f7';
}
