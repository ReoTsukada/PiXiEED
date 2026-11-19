export function enumerate(depth, {limit = Infinity, collect = false} = {}) {
  const rows = Array.from({length: depth}, () => []), masks = Array(depth).fill(0);
  let count = 0; const samples = [];
  function dfs() {
    if (rows[0].length === depth) {
      count++;
      if (collect || samples.length < 3) samples.push(rows.map(r => [...r]).reverse());
      return count >= limit;
    }
    for (let n = 0; n < 10; n++) {
      const vals = [n]; let ok = true;
      for (let level = 0; level <= rows[0].length; level++) {
        if (level) vals[level] = (rows[level - 1].at(-1) + vals[level - 1]) % 10;
        if (masks[level] & (1 << vals[level])) {ok = false; break;}
      }
      if (!ok) continue;
      vals.forEach((v, i) => { rows[i].push(v); masks[i] |= 1 << v; });
      const stop = dfs();
      vals.forEach((v, i) => { rows[i].pop(); masks[i] &= ~(1 << v); });
      if (stop) return true;
    }
    return false;
  }
  dfs(); return {depth, count, samples};
}
if (process.argv[1]?.endsWith('puzzle-audit.mjs')) {
 console.log(JSON.stringify(enumerate(Number(process.argv[2] || 9)), null, 2));
}
