let compactFlowWin = null;

module.exports = {
  get win() { return compactFlowWin; },
  set win(w) { compactFlowWin = w; },
  setCompactFlowWindow(w) { compactFlowWin = w; },
};
