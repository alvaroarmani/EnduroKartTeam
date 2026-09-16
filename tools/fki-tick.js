'use strict';
/*
 * Tick do auto-update FKI: regenera os dados e decide se republica.
 * Imprime "REPUBLISH ..." se houver bateria nova ou voltas novas; senão "NOOP".
 * O agendador (cron) republica o artifact quando ver REPUBLISH.
 */
const { execSync } = require('child_process');
const fs = require('fs');
try { execSync('node tools/build-event-data.js FKI', { stdio: 'ignore' }); }
catch (e) { console.log('NOOP (sem evento FKI no buffer)'); process.exit(0); }

let d; try { d = JSON.parse(fs.readFileSync('data/event-data.json', 'utf8')); }
catch (e) { console.log('NOOP (sem dados)'); process.exit(0); }

const name = d.event.name || '?';
const laps = d.drivers.reduce((s, x) => s + (x.laps ? x.laps.length : 0), 0);
const sf = 'data/.fki-pub-state';
const prev = fs.existsSync(sf) ? fs.readFileSync(sf, 'utf8').trim() : '';
const [pn, pl] = prev.split('|');
if (name !== pn || laps > (+pl || 0)) {
  fs.writeFileSync(sf, name + '|' + laps);
  console.log('REPUBLISH ' + name + ' ' + laps + 'v (prev ' + (prev || '-') + ')');
} else {
  console.log('NOOP ' + laps + 'v');
}
