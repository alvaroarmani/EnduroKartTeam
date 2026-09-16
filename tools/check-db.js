'use strict';
// Testa conexão com o Supabase e se o schema foi aplicado.
const fs = require('fs'), path = require('path');
(function loadEnv(){ try{ const p=path.join(process.cwd(),'.env'); for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){ const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if(m&&!(m[1] in process.env)) process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }catch(e){} })();
const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,''); const KEY=process.env.SUPABASE_KEY||'';
const H={apikey:KEY,Authorization:'Bearer '+KEY};
async function get(pathq){ const r=await fetch(URL+pathq,{headers:H}); const t=await r.text(); return {status:r.status, body:t.slice(0,200)}; }
(async()=>{
  if(!URL||!KEY){ console.log('faltou SUPABASE_URL/KEY no .env'); process.exit(1); }
  console.log('URL:', URL);
  const tables=['sessions','competitors','competitor_samples','laps'];
  for(const t of tables){
    const r=await get('/rest/v1/'+t+'?select=*&limit=1').catch(e=>({status:'ERR',body:String(e)}));
    // Prefer count via head
    let count='?';
    try{ const rc=await fetch(URL+'/rest/v1/'+t+'?select=id',{headers:Object.assign({Prefer:'count=exact'},H)}); count=rc.headers.get('content-range')||'?'; }catch(e){}
    console.log(`  ${t}: HTTP ${r.status}  range=${count}  ${r.status>=400?r.body:''}`);
  }
})();
