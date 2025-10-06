/* ---------- GLOBAL STATE ---------- */
let data = [];           // main dataset
let summary = {};        // JSON summary
let categoricalCols = []; // non-numeric columns for user selection
const ctxCache = {};     // Chart instances cache

/* ---------- HELPER FUNCTIONS ---------- */
const $ = id => document.getElementById(id);
const papaCfg = {header:true,dynamicTyping:true,skipEmptyLines:true};

function loadCSV(file){
  return new Promise((res,rej)=>{
    Papa.parse(file,{...papaCfg,complete:r=>res(r.data),error:e=>rej(e)});
  });
}

function showStatus(msg){ $('loadStatus').textContent = msg; }

function calcMissing(arr){
  const cols = Object.keys(arr[0]);
  return cols.map(c=>{
    const missing = arr.reduce((acc,row)=>(!row[c] && row[c]!==0 ? acc+1 : acc),0);
    return {col:c, perc:+((missing/arr.length)*100).toFixed(2)};
  });
}

const numericCols = arr => Object.keys(arr[0]).filter(k=>typeof arr[0][k]==='number');
const nonNumericCols = arr => Object.keys(arr[0]).filter(k=>typeof arr[0][k]!=='number');

function numericStats(arr){
  const cols = numericCols(arr), out = {};
  cols.forEach(col=>{
    const vals = arr.map(r=>r[col]).filter(v=>v!==null && !Number.isNaN(v));
    if(!vals.length) return;
    const n = vals.length, mean = vals.reduce((a,b)=>a+b,0)/n;
    const sorted=[...vals].sort((a,b)=>a-b);
    const pct = p=>sorted[Math.floor(p*(n-1))];
    const std = Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/n);
    out[col] = {count:n,mean:mean.toFixed(2),std:std.toFixed(2),min:sorted[0],
                q1:pct(.25),median:pct(.5),q3:pct(.75),max:sorted[n-1]};
  });
  return out;
}

function categoricalStats(arr, cols){
  const survivedExists = arr[0].hasOwnProperty('Survived');
  const out = {};
  cols.forEach(col=>{
    const counts={};
    arr.forEach(r=>{
      let key=r[col]??'Missing';
      if(survivedExists) key += ` | Survived:${r.Survived}`;
      counts[key]=(counts[key]||0)+1;
    });
    out[col]=counts;
  });
  return out;
}

function downloadFile(name,content,type){
  const blob=new Blob([content],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
}

function destroyChart(id){ if(ctxCache[id]){ctxCache[id].destroy();delete ctxCache[id];} }

function renderChart(id,type,labels,dataArr,label,xTitle,yTitle){
  destroyChart(id);
  const ctx=$(id).getContext('2d');
  ctxCache[id]=new Chart(ctx,{type,data:{labels,datasets:[{label,data:dataArr,backgroundColor:'rgba(0,123,255,.6)'}]},
    options:{responsive:true,
      scales:{x:{title:{display:true,text:xTitle}},y:{title:{display:true,text:yTitle},beginAtZero:true}},
      plugins:{legend:{display:false}}}});
}

/* ---------- UI RENDERING ---------- */
function shapeInfo(arr){ $('shapeInfo').innerHTML=`Rows: <b>${arr.length}</b> | Columns: <b>${Object.keys(arr[0]).length}</b>`; }

function makeTable(arr,limit,tail=false){
  const cols=Object.keys(arr[0]);
  let rows=arr;
  if(limit!=='all'){ rows=tail?arr.slice(-limit):arr.slice(0,limit);}
  let html=`<div class="table-responsive${limit==='all'?'":" id="allDataContainer"'}"><table class="table table-sm table-striped"><thead><tr>`+
           cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(r=>{html+='<tr>'+cols.map(c=>`<td>${r[c]}</td>`).join('')+'</tr>';});
  $('previewTable').innerHTML=html+'</tbody></table></div>';
}

function numericStatsTable(obj){
  let html='<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Column</th><th>Count</th><th>Mean</th><th>Std</th><th>Min</th><th>25%</th><th>50%</th><th>75%</th><th>Max</th></tr></thead><tbody>';
  Object.entries(obj).forEach(([c,s])=>{
    html+=`<tr><td>${c}</td><td>${s.count}</td><td>${s.mean}</td><td>${s.std}</td><td>${s.min}</td><td>${s.q1}</td><td>${s.median}</td><td>${s.q3}</td><td>${s.max}</td></tr>`;
  });
  $('numericStats').innerHTML=html+'</tbody></table></div>';
}

function categoricalStatsTables(obj){
  let html='';
  Object.entries(obj).forEach(([col,counts])=>{
    html+=`<h6 class="mt-3">${col}</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>`;
    Object.entries(counts).forEach(([k,v])=>{html+=`<tr><td>${k}</td><td>${v}</td></tr>`;});
    html+='</tbody></table></div>';
  });
  $('categoricalStats').innerHTML=html;
}

/* ---------- MAIN WORKFLOW ---------- */
$('loadBtn').addEventListener('click',async()=>{
  const file=$('csvInput').files[0];
  if(!file){alert('Select a CSV first');return;}
  showStatus('Loading…'); data=await loadCSV(file); showStatus('Loaded ✔');
  $('mergeSection').classList.remove('d-none');

  // Overview & preview
  shapeInfo(data); makeTable(data,5); $('previewSelect').value='5';
  categoricalCols=nonNumericCols(data); $('catSelect').innerHTML=categoricalCols.map(c=>`<option>${c}</option>`).join('');

  // Missing chart
  const miss=calcMissing(data);
  renderChart('missingChart','bar',miss.map(m=>m.col),miss.map(m=>m.perc),'Missing','Column','% Missing');

  // Numeric stats
  const nStats=numericStats(data); numericStatsTable(nStats); summary.numeric=nStats; summary.missing=miss;

  // Default bar charts
  const countBy=(key)=>data.reduce((obj,r)=>{if(r[key])obj[r[key]]=(obj[r[key]]||0)+1;return obj;},{});
  const sex=countBy('Sex'), pclass=countBy('Pclass'), emb=countBy('Embarked');
  if(Object.keys(sex).length) renderChart('sexChart','bar',Object.keys(sex),Object.values(sex),'Sex','Sex','Count');
  if(Object.keys(pclass).length) renderChart('pclassChart','bar',Object.keys(pclass),Object.values(pclass),'Pclass','Pclass','Count');
  if(Object.keys(emb).length) renderChart('embChart','bar',Object.keys(emb),Object.values(emb),'Embarked','Embarked','Count');

  // Histograms
  buildHistogram('Age','ageHist'); buildHistogram('Fare','fareHist');
});

$('mergeBtn').addEventListener('click',async()=>{
  if(!data.length){alert('Load a CSV first');return;}
  const file=$('csvInput2').files[0]; if(!file){alert('Select a second CSV');return;}
  const addSrc=$('addSource').checked;
  const newData=await loadCSV(file);
  if(addSrc){
    newData.forEach(r=>r.Source=file.name);
    data.forEach(r=>{if(!r.Source) r.Source=$('csvInput').files[0].name;});
  }
  data=[...data,...newData]; showStatus(`Merged ✔ — ${data.length} rows`);
  shapeInfo(data); makeTable(data,5); categoricalCols=nonNumericCols(data);
  $('catSelect').innerHTML=categoricalCols.map(c=>`<option>${c}</option>`).join('');
});

$('previewSelect').addEventListener('change',e=>{
  const v=e.target.value;
  if(v==='head') makeTable(data,10);
  else if(v==='tail') makeTable(data,10,true);
  else if(v==='all') makeTable(data,'all');
  else makeTable(data,Number(v));
});

$('catBtn').addEventListener('click',()=>{
  const sel=[...$('catSelect').selectedOptions].map(o=>o.value);
  if(!sel.length){alert('Select categorical columns');return;}
  const cStats=categoricalStats(data,sel); categoricalStatsTables(cStats); summary.categorical=cStats;
});

function buildHistogram(col,canvasId){
  if(!data[0][col]) return;
  const vals=data.map(r=>r[col]).filter(v=>v!==null && !Number.isNaN(v));
  if(!vals.length) return;
  const n=vals.length,k=n<50?5:Math.ceil(Math.log2(n)+1);
  const min=Math.min(...vals),max=Math.max(...vals),bw=(max-min)/k,bins=new Array(k).fill(0);
  vals.forEach(v=>bins[Math.min(Math.floor((v-min)/bw),k-1)]++);
  const labels=bins.map((_,i)=>`${(min+bw*i).toFixed(1)}-${(min+bw*(i+1)).toFixed(1)}`);
  renderChart(canvasId,'bar',labels,bins,col,col,'Count');
}

$('exportBtn').addEventListener('click',()=> data.length?downloadFile('merged.csv',Papa.unparse(data),'text/csv'):alert('Nothing to export'));
$('exportJSONBtn').addEventListener('click',()=> Object.keys(summary).length?downloadFile('summary.json',JSON.stringify(summary,null,2),'application/json'):alert('Run analysis first'));