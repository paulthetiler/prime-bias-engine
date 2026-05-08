// Alignment utility — shared across Dashboard, Detail, WhyThisTrade

export function calcAlignment(results) {
  if (!results) return { label: 'LOW', count: 0 };
  const { deepResult, ddResult, nowResult, mainDirection } = results;
  const dir = mainDirection === 'BUY' ? 1 : -1;
  const count = [deepResult === dir ? 1 : 0, ddResult === dir ? 1 : 0, nowResult === dir ? 1 : 0]
    .reduce((a, b) => a + b, 0);
  const label = count === 3 ? 'HIGH' : count === 2 ? 'MEDIUM' : 'LOW';
  return { label, count };
}

export function alignmentColor(label) {
  if (label === 'HIGH') return 'text-primary';
  if (label === 'MEDIUM') return 'text-yellow-700 dark:text-yellow-400';
  return 'text-destructive';
}

export function alignmentBg(label) {
  if (label === 'HIGH') return 'bg-primary/10 border-primary/30 text-primary';
  if (label === 'MEDIUM') return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-800 dark:text-yellow-300';
  return 'bg-destructive/10 border-destructive/30 text-destructive';
}