/*
 * Teste de regressão das funções puras do extrator (sem DOM).
 * Rodar:  node test/parse.test.js
 */
const X = require('../src/extractor/mylaptime-extractor.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; }
  else { fail++; console.log(`  ✗ ${label} — obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`); }
}

// parseTimeToMs
eq('45.678', X.parseTimeToMs('45.678'), 45678);
eq('1:02.540 (mm:ss)', X.parseTimeToMs('1:02.540'), 62540);
eq('1:32:10.284 (hh:mm:ss)', X.parseTimeToMs('1:32:10.284'), 5530284);
eq('9.9', X.parseTimeToMs('9.9'), 9900);
eq('vírgula 44,812', X.parseTimeToMs('44,812'), 44812);
eq('--- => null', X.parseTimeToMs('---'), null);
eq('vazio => null', X.parseTimeToMs(''), null);
eq('lixo => null', X.parseTimeToMs('abc'), null);

// parseGap
eq('+2.317 => time', X.parseGap('+2.317'), { raw: '+2.317', type: 'time', ms: 2317 });
eq('+1 volta => laps', X.parseGap('+1 volta'), { raw: '+1 volta', type: 'laps', laps: 1 });
eq('+2 voltas => laps', X.parseGap('+2 voltas').laps, 2);
eq('--- => none', X.parseGap('---').type, 'none');

console.log(`\n${fail ? '✗' : '✓'} parse.test.js — ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
