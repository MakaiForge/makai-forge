function showFinalSuccess(exePath, suggestedDir) {
  CF._selectedCandidate = exePath;
  CF._suggestedDir = suggestedDir || null;
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
        title: CF.currentGameName || 'Game',
        exePath: CF._selectedCandidate || CF.currentExePath || '',
        prefixPath: CF._suggestedDir || '',
        protonVersion: CF.selectedProtonVersion || '',
        protonPath: CF.selectedProtonPath || '',
      };
      window.compatflow.openProtonForger(gameData);
    };
    document.querySelector('.modal-success .modal-body').appendChild(btn);
  }
  successModal.classList.remove('hidden');
}

function showCandidates(candidates, gameTitle, version, prefixPath) {
  CF._selectedCandidate = null;
  CF._suggestedDir = prefixPath || null;
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
      CF._selectedCandidate = el.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    });
    el.querySelector('input').addEventListener('change', () => {
      CF._selectedCandidate = el.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    });
  });

  const manualBtn = document.getElementById('candidateManual');
  if (manualBtn) {
    manualBtn.onclick = () => {
      candidateModal.classList.add('hidden');
      window.compatflow.openFile().then(path => {
        if (path) {
          showFinalSuccess(path, CF._suggestedDir);
        } else {
          showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
        }
      });
    };
  }

  const firstRadio = document.querySelector('input[name="candidate"]');
  if (firstRadio) {
    firstRadio.checked = true;
    const firstItem = document.querySelector('.candidate-item');
    if (firstItem) {
      CF._selectedCandidate = firstItem.dataset.path;
      document.getElementById('candidateSelectBtn').disabled = false;
    }
  }

  candidateModal.classList.remove('hidden');
}
