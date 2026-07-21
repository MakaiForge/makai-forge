const emptyState = document.getElementById('emptyState');
const analyzing = document.getElementById('analyzing');
const result = document.getElementById('result');
const dropzone = document.getElementById('dropzone');
const selectBtn = document.getElementById('selectBtn');
const closeBtn = document.getElementById('closeBtn');
const fileName = document.getElementById('fileName');
const filePath = document.getElementById('filePath');
const resultContent = document.getElementById('resultContent');
const fileBadge = document.getElementById('fileBadge');
const protonModal = document.getElementById('protonModal');
const installedContainer = document.getElementById('installedVersions');
const availableContainer = document.getElementById('availableVersions');
const modalClose = document.getElementById('modalClose');
const protonProgress = document.getElementById('protonProgress');
const progressText = document.getElementById('progressText');
const successModal = document.getElementById('successModal');
const successClose = document.getElementById('successClose');
const successTitle = document.getElementById('successTitle');
const successMessage = document.getElementById('successMessage');
const successIcon = document.getElementById('successIcon');
const successModalTitle = document.getElementById('successModalTitle');
const progressModal = document.getElementById('progressModal');
const progressTitle = document.getElementById('progressTitle');
const progressMessage = document.getElementById('progressMessage');
const candidateModal = document.getElementById('candidateModal');
const candidateClose = document.getElementById('candidateClose');

let currentGameName = '';
let selectedProtonVersion = '';
let selectedProtonPath = '';
let currentExePath = '';
let currentCatalogData = null;

function show(view) {
  [emptyState, analyzing, result].forEach(el => el.classList.add('hidden'));
  if (view) view.classList.remove('hidden');
}

closeBtn.addEventListener('click', () => window.close());

async function processFile(filePathString) {
  show(analyzing);
  currentExePath = filePathString;
  const parts = filePathString.split(/[/\\]/);
  const name = parts.pop();
  fileName.textContent = name;
  filePath.textContent = parts.join('/') + '/';
  const [data, iconDataUrl] = await Promise.all([
    window.compatflow.analyzeFile(filePathString),
    window.compatflow.extractIcon(filePathString),
  ]);
  if (iconDataUrl) {
    fileBadge.innerHTML = `<img src="${iconDataUrl}">`;
  }
  let catalogResults = [];
  const searchTerm = data.game_name || data.clean_name;
  if (searchTerm) {
    catalogResults = await window.compatflow.catalogSearch(searchTerm);
  }
  currentCatalogData = (catalogResults && catalogResults.length > 0) ? catalogResults[0] : null;
  currentGameName = currentCatalogData?.title || data.game_name || data.app || name;
  renderResult(data, iconDataUrl, catalogResults);
}

function renderResult(data, iconDataUrl, catalogResults) {
  show(result);
  const cardIcon = iconDataUrl
    ? `<img src="${iconDataUrl}" class="card-icon-img">`
    : null;
  let html = '';

  if (catalogResults && catalogResults.length > 0) {
    const g = catalogResults[0];
    const img = g.libraryImageUrl
      ? `<img src="${g.libraryImageUrl}" class="catalog-img" onerror="this.style.display='none'">`
      : '';
    const genresHtml = g.genres && Array.isArray(g.genres)
      ? g.genres.slice(0, 3).map(s => `<span class="catalog-chip">${escapeHtml(s)}</span>`).join('')
      : '';
    const protonHtml = g.recommendedProton
      ? `<span class="detail-chip catalog-proton">🍷 Proton ${escapeHtml(g.recommendedProton)}</span>`
      : '';
    html += `
      <div class="result-card catalog-card">
        ${img}
        <div class="card-header">
          <div class="card-icon catalog">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div>
            <div class="card-title">
              ${escapeHtml(g.title)}
              <span class="card-title-tag catalog">Catálogo</span>
            </div>
            <div class="card-subtitle">
              ${g.shortDescription ? escapeHtml(g.shortDescription) : 'Jogo encontrado no catálogo Makai Forger'}
            </div>
          </div>
        </div>
        <div class="card-details">
          ${genresHtml}
          ${g.developer ? `<span class="detail-chip">🎮 ${escapeHtml(g.developer)}</span>` : ''}
          ${g.releaseYear ? `<span class="detail-chip">📅 ${g.releaseYear}</span>` : ''}
          ${protonHtml}
          ${g.protonConfidence ? `<span class="detail-chip">📊 ${g.protonConfidence}%</span>` : ''}
        </div>
      </div>`;
  }

  if (data.type === 'archive') {
    html += `
      <div class="result-card">
        <div class="card-header">
          ${cardIcon || `<div class="card-icon wine">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>`}
          <div>
            <div class="card-title">Arquivo XZ</div>
            <div class="card-subtitle">Arquivo de instalação</div>
          </div>
        </div>
        <div class="card-details">
          <span class="detail-chip">📦 ${escapeHtml(data.original)}</span>
          <span class="detail-chip">📏 ${data.size_mb} MB</span>
        </div>
      </div>`;
  } else if (data.type === 'native') {
    const accent = 'native';
    html += `
      <div class="result-card">
        <div class="card-header">
          ${cardIcon || `<div class="card-icon ${accent}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>`}
          <div>
            <div class="card-title">
              ${escapeHtml(data.app)}
              <span class="card-title-tag ${accent}">Nativo</span>
            </div>
            <div class="card-subtitle">${escapeHtml(data.desc)}</div>
          </div>
        </div>
        <div class="card-details">
          <span class="detail-chip">📦 <strong>${escapeHtml(data.package)}</strong></span>
          ${data.distro ? `<span class="detail-chip">🐧 ${escapeHtml(data.distro.name)}</span>` : ''}
        </div>
        ${data.install_cmd ? `
        <div class="card-action">
          <div class="btn-install-wrap">
            <span class="btn-install-arrow">◄ Instalar</span>
            <button id="installBtn" class="btn btn-success glow-active" style="flex:1">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Instalar
            </button>
          </div>
          <div id="installOutput" class="install-output">${escapeHtml(data.install_cmd)}</div>
        </div>
        ` : ''}
      </div>`;
  } else if (data.type === 'port') {
    html += `
      <div class="result-card">
        <div class="card-header">
          ${cardIcon || `<div class="card-icon game">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/>
              <line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/>
              <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>
            </svg>
          </div>`}
          <div>
            <div class="card-title">
              ${escapeHtml(data.app)}
              <span class="card-title-tag download">Port</span>
            </div>
            <div class="card-subtitle">Port disponível via Lutris</div>
          </div>
        </div>
        <div class="card-action">
          <p style="font-size:12px;color:var(--text-secondary);line-height:1.5">Instale o Lutris e adicione este port manualmente para jogar.</p>
        </div>
      </div>`;
  } else if (data.type === 'game') {
    const hasCatalog = catalogResults && catalogResults.length > 0;
    const gameTitle = hasCatalog ? catalogResults[0].title : (data.game_name || data.app);
    html += `
      <div class="result-card">
        <div class="card-header">
          ${cardIcon || `<div class="card-icon game">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/>
              <line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/>
              <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>
            </svg>
          </div>`}
          <div>
            <div class="card-title">
              ${escapeHtml(gameTitle)}
              <span class="card-title-tag wine">Jogo</span>
            </div>
            <div class="card-subtitle">${hasCatalog ? 'Jogo encontrado no catálogo' : 'Jogo identificado'}</div>
          </div>
        </div>
        <div class="card-action">
          <div class="btn-install-wrap">
            <span class="btn-install-arrow">◄ Instalar</span>
            <button id="protonSelectBtn" class="btn btn-success glow-active" style="flex:1">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Instalar com Makai Forger
            </button>
          </div>
        </div>
      </div>`;
  } else {
    html += `
      <div class="result-card">
        <div class="card-header">
          ${cardIcon || `<div class="card-icon wine">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>`}
          <div>
            <div class="card-title">${escapeHtml(data.game_name || data.app || name || 'Desconhecido')}</div>
            <div class="card-subtitle">Nenhuma correspondência no catálogo</div>
          </div>
        </div>
        <div class="card-action">
          <div class="btn-install-wrap">
            <span class="btn-install-arrow">◄ Instalar</span>
            <button id="protonSelectBtn" class="btn btn-success glow-active" style="flex:1">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Instalar com Makai Forger
            </button>
          </div>
        </div>
      </div>`;
  }

  resultContent.innerHTML = html;

  const installBtn = document.getElementById('installBtn');
  if (installBtn && data.install_cmd) {
    installBtn.addEventListener('click', () => {
      installBtn.classList.add('disabled');
      installBtn.textContent = 'Abrindo terminal...';
      const out = document.getElementById('installOutput');
      if (out) out.classList.add('show');
      window.compatflow.installPackage(data.install_cmd);
    });
  }

  const protonSelectBtn = document.getElementById('protonSelectBtn');
  if (protonSelectBtn) {
    protonSelectBtn.addEventListener('click', () => openProtonSelector());
  }
}

// ─── Proton Selector ───

async function openProtonSelector() {
  protonModal.classList.remove('hidden');
  installedContainer.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px;">Carregando...</div>';
  availableContainer.innerHTML = '';

  const [installed, available, forks] = await Promise.all([
    window.compatflow.protonList(),
    window.compatflow.protonAvailable(),
    window.compatflow.protonForks().catch((e) => { console.error('protonForks API error:', e); return []; }),
  ]);

  // Busca rating individual por release (via API Python)
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

  // Index forks por id para lookup rápido
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

function confidencePercent(level) {
  const map = { high: 90, medium: 65, low: 35 };
  return map[level] || 50;
}

function confidenceColor(level) {
  const map = { high: '#22c55e', medium: '#eab308', low: '#ef4444' };
  return map[level] || '#a855f7';
}

function renderRecommendation() {
  const el = document.getElementById('recommendationSection');
  if (!el) return;
  if (!currentCatalogData) {
    el.innerHTML = '';
    return;
  }
  const cd = currentCatalogData;
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
    // Recarregar lista de instalados
    const installed = await window.compatflow.protonList();
    renderProtonInstalled(installed);
  } else {
    btn.disabled = false;
    btn.textContent = 'Baixar';
    showSuccess('Erro', `Falha ao baixar ${tag}: ${result.error}`);
  }
}

async function startInstall(version, binPath) {
  protonModal.classList.add('hidden');
  selectedProtonVersion = version;
  selectedProtonPath = binPath.substring(0, binPath.lastIndexOf('/'));

  // Extrai diretório pai do binário
  const protonDir = selectedProtonPath;

  // Determina gameId
  const cd = currentCatalogData;
  const gameId = (cd && cd.objectId) ? cd.objectId : `custom_${(currentGameName || 'game').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
  const gameTitle = cd ? cd.title : currentGameName;

  // Abre overlay de progresso
  showProgress('Instalando...', `Preparando prefixo Wine com ${version}...`);

  const result = await window.compatflow.gameInstall({
    gameId,
    gameTitle,
    exePath: currentExePath,
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

// ─── Modal helpers ───

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

// Recebe logs em tempo real do bridge
if (window.compatflow && window.compatflow.onInstallLog) {
  window.compatflow.onInstallLog((line) => {
    const log = document.getElementById('progressLog');
    if (log) {
      log.textContent += line + '\n';
      log.scrollTop = log.scrollHeight;
    }
  });
}

function showError(title, msg) {
  successIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  successIcon.style.stroke = '#ef4444';
  successModalTitle.textContent = 'Erro';
  successTitle.textContent = title;
  successMessage.textContent = msg;
  successModal.classList.remove('hidden');
}

let _selectedCandidate = null;
let _suggestedDir = null;

function showFinalSuccess(exePath, suggestedDir) {
  _selectedCandidate = exePath;
  _suggestedDir = suggestedDir || null;
  successIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
  successIcon.style.stroke = '#22c55e';
  successModalTitle.textContent = 'Tudo pronto!';
  successTitle.textContent = 'Aplicado com sucesso';
  successMessage.innerHTML = 'Clique abaixo para finalizar e ser redirecionado à aba <strong>Games</strong> do Makai Forger.';
  successClose.style.display = 'none';
  const existingBtn = document.querySelector('.modal-success .btn-finalize');
  if (!existingBtn) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-finalize';
    btn.textContent = 'Ir para aba Games';
    btn.style.cssText = 'margin-top:16px;padding:8px 24px;font-size:13px;';
    btn.onclick = () => {
      const gameData = {
        title: currentGameName || 'Game',
        exePath: _selectedCandidate || currentExePath || '',
        prefixPath: _suggestedDir || '',
        protonVersion: selectedProtonVersion || '',
        protonPath: selectedProtonPath || '',
      };
      window.compatflow.openProtonForger(gameData);
    };
    document.querySelector('.modal-success .modal-body').appendChild(btn);
  }
  successModal.classList.remove('hidden');
}

function showCandidates(candidates, gameTitle, version, prefixPath) {
  _selectedCandidate = null;
  _suggestedDir = prefixPath || null;
  document.getElementById('candidateSelectBtn').disabled = true;
  document.getElementById('candidateList').innerHTML = candidates.map((c, i) => {
    const sizeKb = (c.size / 1024).toFixed(0);
    const isChecked = i === 0 ? 'checked' : '';
    const relParts = c.relative.split('/');
    const parentDir = relParts.slice(0, -1).join('/');
    const dirLabel = parentDir || 'drive_c/';
    return `
    <label class="candidate-item" data-path="${escapeHtml(c.path)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background .15s;margin-bottom:4px;border:1px solid rgba(168,85,247,0.15);">
      <input type="radio" name="candidate" value="${escapeHtml(c.path)}" ${isChecked} style="accent-color:#a855f7;">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a855f7" stroke-width="2" style="flex-shrink:0;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${escapeHtml(c.name)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(dirLabel)}</div>
        </div>
      </div>
      <span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;">${sizeKb} KB</span>
    </label>`;
  }).join('');

  document.querySelectorAll('.candidate-item').forEach(el => {
    el.addEventListener('click', () => {
      const radio = el.querySelector('input');
      radio.checked = true;
      _selectedCandidate = el.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    });
    el.querySelector('input').addEventListener('change', () => {
      _selectedCandidate = el.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    });
  });

  // Botão "Procure manualmente"
  const manualBtn = document.getElementById('candidateManual');
  if (manualBtn) {
    manualBtn.onclick = () => {
      candidateModal.classList.add('hidden');
      window.compatflow.openFile().then(path => {
        if (path) {
          showFinalSuccess(path, _suggestedDir);
        } else {
          showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
        }
      });
    };
  }

  // Auto-seleciona o primeiro
  const firstRadio = document.querySelector('input[name="candidate"]');
  if (firstRadio) {
    firstRadio.checked = true;
    const firstItem = document.querySelector('.candidate-item');
    if (firstItem) {
      _selectedCandidate = firstItem.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    }
  }

  candidateModal.classList.remove('hidden');
}

document.getElementById('candidateSelectBtn').addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  if (_selectedCandidate) {
    showFinalSuccess(_selectedCandidate, _suggestedDir);
  }
});

document.getElementById('candidateSkip').addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
});

candidateModal.addEventListener('click', (e) => {
  if (e.target === candidateModal) {
    candidateModal.classList.add('hidden');
    showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
  }
});

modalClose.addEventListener('click', () => protonModal.classList.add('hidden'));
successClose.addEventListener('click', () => successModal.classList.add('hidden'));
candidateClose.addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
});
protonModal.addEventListener('click', (e) => { if (e.target === protonModal) protonModal.classList.add('hidden'); });
successModal.addEventListener('click', (e) => { if (e.target === successModal) successModal.classList.add('hidden'); });

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Logger UI ───
document.getElementById('logToggle').addEventListener('change', (e) => {
  window.compatflow.setLogEnabled(e.target.checked);
});

document.getElementById('openLogBtn').addEventListener('click', () => {
  window.compatflow.openLogFile();
});

selectBtn.addEventListener('click', async () => {
  const file = await window.compatflow.openFile();
  if (file) processFile(file);
});

window.compatflow.onFileOpened((filePath) => {
  processFile(filePath);
});

let dragCounter = 0;

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) dropzone.classList.remove('hidden');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) dropzone.classList.add('hidden');
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.add('hidden');
  const file = e.dataTransfer.files[0];
  if (file && (file.name.endsWith('.exe') || file.name.endsWith('.msi') || file.name.endsWith('.xz'))) {
    processFile(file.path);
  }
});
