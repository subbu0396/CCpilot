function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function meanVector(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  return mean.map((x) => x / vectors.length);
}

export function kMeans(
  vectors: number[][],
  k: number,
  maxIterations = 50
): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (k >= n) return vectors.map((_, i) => i);

  const centroids: number[][] = [];
  const used = new Set<number>();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!used.has(idx)) {
      used.add(idx);
      centroids.push([...vectors[idx]]);
    }
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = vectors.map((v) => {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = euclideanDistance(v, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      return best;
    });

    const unchanged = newAssignments.every((a, i) => a === assignments[i]);
    assignments = newAssignments;
    if (unchanged) break;

    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length > 0) centroids[c] = meanVector(members);
    }
  }

  return assignments;
}

export function optimalK(n: number): number {
  if (n <= 3) return Math.max(1, n);
  return Math.min(8, Math.max(3, Math.round(Math.sqrt(n / 2))));
}
