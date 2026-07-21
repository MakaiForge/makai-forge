async function openProtonSelector() {
  protonModal.classList.remove('hidden');
  installedContainer.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px;">Carregando...</div>';
  availableContainer.innerHTML = '';

  const [installed, available, forks] = await Promise.all([
    window.compatflow.protonList(),
    window.compatflow.protonAvailable(),
    window.compatflow.protonForks().catch((e) => { console.error('protonForks API error:', e); return []; }),
  ]);

  const ratingsMap = {};
  if (available.length > 0) {
    const flatReleases = [];
    for (const group of available) {
      for (const r of group.releases) {
        flatReleases.push({ toolId: group.toolId, tag: r.tag, published: r.published });
      }
    }
    const ratResult = await window.compatflow.getReleaseRatings(flatReleases).catch(() => null);
    if (ratResult && ratResult.success && Array.isArray(ratResult.data)) {
      for (const rated of ratResult.data) {
        ratingsMap[rated.tag] = rated.rating;
      }
    }
  }

  const forkMap = {};
  if (Array.isArray(forks)) {
    for (const f of forks) {
      forkMap[f.id] = f;
    }
  }

  renderRecommendation();
  renderProtonInstalled(installed, forkMap);
  renderProtonAvailable(available, forkMap, ratingsMap);
}

function renderRecommendation() {
  const el = document.getElementById('recommendationSection');
  if (!el) return;
  if (!CF.currentCatalogData) {
    el.innerHTML = '';
    return;
  }
  const cd = CF.currentCatalogData;
  const pct = cd.protonConfidence ? confidencePercent(cd.protonConfidence) : null;
  const color = cd.protonConfidence ? confidenceColor(cd.protonConfidence) : '#a855f7';
  const alts = cd.protonAlternatives || [];

  let html = `<div class="rec-title">🎯 Recomendação Makai Forger</div>`;

  if (cd.recommendedProton) {
    html += `
      <div class="rec-primary">
        <div class="rec-fork">${escapeHtml(cd.recommendedProton)}</div>
        <div class="rec-version">${cd.protonSource ? escapeHtml(cd.protonSource) : ''}</div>
        ${pct ? `
        <div class="rec-confidence-bar">
          <div class="rec-confidence-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="rec-confidence-label" style="color:${color};">${pct}%</div>` : ''}
      </div>`;
  }

  if (alts.length > 0) {
    for (const alt of alts.slice(0, 4)) {
      html += `
        <div class="rec-alt">
          <span class="alt-fork">${escapeHtml(alt.fork)} ${escapeHtml(alt.version)}</span>
          ${alt.notes ? `— ${escapeHtml(alt.notes)}` : ''}
        </div>`;
    }
    if (alts.length > 4) {
      html += `<div class="rec-alt" style="color:var(--text-tertiary);font-size:10px;">+${alts.length - 4} alternativas</div>`;
    }
  }

  el.innerHTML = html;
}

function renderProtonInstalled(installed, forkMap) {
  if (installed.length === 0) {
    installedContainer.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:8px;">Nenhum Proton instalado</div>';
    return;
  }
  installedContainer.innerHTML = installed.map(v => {
    const forkEntry = findForkForName(v.name, forkMap);
    let ratingBadge = '';
    if (forkEntry) {
      const c = tierColorMap[forkEntry.ranking] || '#a855f7';
      ratingBadge = `<span style="display:inline-block;font-size:9px;font-weight:700;padding:0 6px;border-radius:4px;background:${c}22;color:${c};margin-left:6px;">${escapeHtml(forkEntry.ranking || '')}</span>`;
    }
    return `
    <div class="proton-item" data-version="${escapeHtml(v.version)}" data-bin="${escapeHtml(v.protonBin)}">
      <div class="proton-item-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 11 12 14 22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </div>
      <div class="proton-item-info">
        <div class="proton-item-name">${escapeHtml(v.name)}${ratingBadge}</div>
        <div class="proton-item-desc">${escapeHtml(v.dir)}</div>
      </div>
      <button class="proton-btn-install select-version">Selecionar</button>
    </div>`;
  }).join('');

  installedContainer.querySelectorAll('.select-version').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.proton-item');
      const version = item.dataset.version;
      const binPath = item.dataset.bin;
      startInstall(version, binPath);
    });
  });
}

function renderProtonAvailable(available, forkMap, ratingsMap) {
  if (available.length === 0) {
    availableContainer.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:8px;">Nenhum release disponível em cache</div>';
    return;
  }
  const sorted = [...available].sort((a, b) => rankingSortKey(a, forkMap) - rankingSortKey(b, forkMap));
  availableContainer.innerHTML = sorted.map(group => {
    const forkRating = findForkForName(group.name, forkMap) || forkMap[group.toolId];
    let ratingHtml = '';
    if (forkRating) {
      const tierColor = tierColorMap[forkRating.ranking] || '#a855f7';
      ratingHtml = `
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
          <span class="detail-chip" style="background:${tierColor}22;border-color:${tierColor}44;color:${tierColor};font-weight:700;">
            ${escapeHtml(forkRating.ranking || 'N/A')}
          </span>
          <span class="detail-chip" style="font-size:10px;">
            ${forkRating.tierScore != null ? forkRating.tierScore + '%' : ''}
          </span>
          ${forkRating.features && forkRating.features.length > 0
            ? `<span class="detail-chip" style="font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${forkRating.features.slice(0, 4).map(f => escapeHtml(f)).join(', ')}
              </span>`
            : ''}
        </div>`;
    }
    return `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">
        ${escapeHtml(group.name)}
        ${forkRating ? `<span style="font-size:10px;color:var(--text-tertiary);margin-left:6px;">(${escapeHtml(group.toolId)})</span>` : ''}
      </div>
      ${ratingHtml}
      ${group.releases.map(r => {
        const sizeMb = (r.size / 1024 / 1024).toFixed(0);
        const rRating = ratingsMap ? ratingsMap[r.tag] : null;
        const rColor = rRating != null ? ratingColor(rRating) : '';
        return `<div class="proton-item" data-tag="${escapeHtml(r.tag)}" data-url="${escapeHtml(r.url)}">
          <div class="proton-item-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div class="proton-item-info">
            <div class="proton-item-name">
              ${escapeHtml(r.tag)}
              ${rRating != null ? `<span style="display:inline-block;font-size:9px;font-weight:700;padding:0 6px;border-radius:4px;background:${rColor}22;color:${rColor};margin-left:6px;">${rRating}%</span>` : ''}
            </div>
            <div class="proton-item-desc">${sizeMb} MB</div>
          </div>
          <button class="proton-btn-install download-version">Baixar</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  availableContainer.querySelectorAll('.download-version').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.proton-item');
      const tag = item.dataset.tag;
      const url = item.dataset.url;
      downloadAndInstall(tag, url, btn);
    });
  });
}

async function downloadAndInstall(tag, url, btn) {
  btn.disabled = true;
  btn.textContent = 'Baixando...';
  protonProgress.classList.remove('hidden');
  progressText.textContent = `Baixando ${tag}...`;

  const result = await window.compatflow.protonInstall(tag, url);

  protonProgress.classList.add('hidden');

  if (result.success) {
    showSuccess('Proton instalado!', `${tag} foi instalado com sucesso. Selecione-o na lista acima.`);
    const installed = await window.compatflow.protonList();
    const forkMap = {};
    const forks = await window.compatflow.protonForks().catch(() => []);
    if (Array.isArray(forks)) for (const f of forks) forkMap[f.id] = f;
    renderProtonInstalled(installed, forkMap);
  } else {
    btn.disabled = false;
    btn.textContent = 'Baixar';
    showSuccess('Erro', `Falha ao baixar ${tag}: ${result.error}`);
  }
}

async function startInstall(version, binPath) {
  protonModal.classList.add('hidden');
  CF.selectedProtonVersion = version;
  CF.selectedProtonPath = binPath.substring(0, binPath.lastIndexOf('/'));

  const protonDir = CF.selectedProtonPath;
  const cd = CF.currentCatalogData;
  const gameId = (cd && cd.objectId) ? cd.objectId : `custom_${(CF.currentGameName || 'game').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
  const gameTitle = cd ? cd.title : CF.currentGameName;

  showProgress('Instalando...', `Preparando prefixo Wine com ${version}...`);

  const result = await window.compatflow.gameInstall({
    gameId,
    gameTitle,
    exePath: CF.currentExePath,
    protonPath: protonDir,
  });

  progressModal.classList.add('hidden');

  if (result.success) {
    if (result.candidates && result.candidates.length > 0) {
      showCandidates(result.candidates, gameTitle, version, result.prefixPath, result.suggestedDirs);
    } else {
      showSuccess('Instalação concluída', `${version}. Nenhum executável encontrado. Verifique se o instalador foi executado corretamente.`);
    }
  } else {
    showError('Falha na instalação', result.error || 'Erro desconhecido');
  }
}

window.compatflow.onInstallLog((line) => {
  const log = document.getElementById('progressLog');
  if (log) {
    log.textContent += line + '\n';
    log.scrollTop = log.scrollHeight;
  }
});
