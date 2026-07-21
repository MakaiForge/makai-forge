async function processFile(filePathString) {
  show(analyzing);
  CF.currentExePath = filePathString;
  const parts = filePathString.split(/[/\\]/);
  const name = parts.pop();
  fileName.textContent = name;
  filePath.textContent = parts.join('/') + '/';

  const data = await window.compatflow.analyzeFile(filePathString);
  CF.currentGameName = data.game_name || data.app || name;
  renderResult(data, null, []);

  window.compatflow.extractIcon(filePathString, data.app || data.game_name).then(url => {
    CF._lastIconUrl = url;
    if (!url) return;
    fileBadge.innerHTML = `<img src="${url}">`;
    const cardIcon = document.querySelector('.card-icon-img');
    if (!cardIcon) {
      const ci = document.querySelector('.card-icon');
      if (ci && !ci.querySelector('img')) {
        ci.innerHTML = ''; ci.style.padding = '0';
        const img = document.createElement('img');
        img.src = url;
        img.className = 'card-icon-img';
        ci.replaceWith(img);
      }
    }
  }).catch(() => {});

  const searchTerm = data.game_name || data.clean_name;
  if (searchTerm) {
    window.compatflow.catalogSearch(searchTerm).then(results => {
      if (results && results.length > 0) {
        CF.currentCatalogData = results[0];
        CF.currentGameName = CF.currentCatalogData?.title || data.game_name || data.app || name;
        renderResult(data, CF._lastIconUrl, results);
      }
    }).catch(() => {});
  }
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
