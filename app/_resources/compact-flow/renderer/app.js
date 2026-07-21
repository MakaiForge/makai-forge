closeBtn.addEventListener('click', () => window.close());

selectBtn.addEventListener('click', async () => {
  const file = await window.compatflow.openFile();
  if (file) processFile(file);
});

window.compatflow.onFileOpened((data) => {
  const filePath = typeof data === 'string' ? data : data.filePath;
  const testMode = typeof data === 'object' ? data.testMode : false;
  processFile(filePath);
  if (testMode) {
    document.getElementById('startAnalysis').click();
  }
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

// Modal close buttons
modalClose.addEventListener('click', () => protonModal.classList.add('hidden'));
successClose.addEventListener('click', () => successModal.classList.add('hidden'));
candidateClose.addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
});

protonModal.addEventListener('click', (e) => { if (e.target === protonModal) protonModal.classList.add('hidden'); });
successModal.addEventListener('click', (e) => { if (e.target === successModal) successModal.classList.add('hidden'); });

document.getElementById('candidateSelectBtn').addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  if (CF._selectedCandidate) {
    showFinalSuccess(CF._selectedCandidate, CF._suggestedDir);
  }
});

document.getElementById('candidateSkip').addEventListener('click', () => {
  candidateModal.classList.add('hidden');
  showSuccess('Instalação concluída', 'Você pode configurar manualmente na aba Games do Makai Forger.');
});

document.getElementById('logToggle').addEventListener('change', (e) => {
  window.compatflow.setLogEnabled(e.target.checked);
});

document.getElementById('openLogBtn').addEventListener('click', () => {
  window.compatflow.openLogFile();
});
