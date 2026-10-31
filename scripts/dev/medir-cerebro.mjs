// Abrinay Mind — mide el cerebro con una bóveda INVENTADA del tamaño real (364 notas, vectores de 1024 números), sin red ni llaves.
//   node scripts/dev/medir-cerebro.mjs
// 1) CPU por mensaje (armarContexto, búsqueda por significado, lector del streaming): el Worker del plan gratuito de Cloudflare tiene ~10 ms de CPU.
// 2) Cómo se comporta el servidor ante fallos del proveedor (saturado, corte a mitad, max_tokens) y la detección de modo.
// 3) Si el cerebro lee lo mismo cuando la conversación sigue («hazla más corta»).
// Las cifras son de Node (orden de magnitud, no las de Cloudflare); sirven para comparar antes y después de un cambio.
import { entorno } from '../../tests/helpers.mjs';
import { armarContexto } from '../../src/context.js';
import { lectorDeEventos } from '../../src/chat.js';
import { una } from '../../src/db.js';
// IA de mentira con vectores de 1024 números pseudoaleatorios pero con estructura (por palabra), como bge-m3
const hashN=(s)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const vec=(t)=>{const v=new Float64Array(1024);for(const w of String(t).toLowerCase().split(/\W+/).filter(Boolean)){let h=hashN(w);for(let k=0;k<12;k++){h=Math.imul(h^(h>>>15),2246822507)>>>0;v[h%1024]+=((h>>>11)%2?1:-1)}}return Array.from(v)};
const AI={async run(m,{text}){return {data:text.map(vec),shape:[text.length,1024]}}};
const t=await entorno({ extra:{AI}, });
t.env.AI=AI;
await t.j('POST','/api/brains/import',{cerebro:{slug:'real',nombre:'Real',subtitulo:'x',color:'#94a3b8'}});
const pal=['noche','ciudad','rima','espejo','madre','calle','lluvia','amor','miedo','tiempo','reloj','ventana','humo','neón','eco','mar','soledad','batalla','verso','cierre'];
const rnd=(i,n)=>pal[(i*7+n*13)%pal.length];
const notas=[];
for(let i=0;i<364;i++){ const cuerpo=Array.from({length:60},(_,k)=>`${rnd(i,k)} ${rnd(i,k+3)} ${rnd(i+1,k)} y ${rnd(i,k+9)}.`).join(' ');
  const enl=[1,2,3,4].map(k=>`[[Nota ${(i*k+11)%364}]]`).join(' ');
  notas.push({nombre:`Nota ${i}`,carpeta:`${10*(i%7)}-Lobulo`,texto:(i<6?'---\nsiempre: true\n---\n':i%40===0?'---\ntipo: modo\npalabras: noche, eco\n---\n':'')+`# Nota ${i}\n\n${cuerpo}\n\n${enl}\n`}); }
for(let i=0;i<notas.length;i+=12) await t.j('POST','/api/b/real/import/notas',{notas:notas.slice(i,i+12)});
await t.j('POST','/api/b/real/menciones',{desde:0,cuantas:400});
let e; do { e=(await t.j('POST','/api/b/real/meaning/index',{cuantas:8})).datos; } while(e.pendientes>0&&e.hechas>0);
console.log('vectores:',e.activo, 'notas:',notas.length);
const brain=await una(t.db,'select * from brains where slug = ?','real');
const cpu=(f)=>async()=>{const a=process.cpuUsage();const t0=performance.now();const r=await f();const c=process.cpuUsage(a);return {ms:+(( c.user+c.system)/1000).toFixed(1),reloj:+(performance.now()-t0).toFixed(1),r}};
for(let i=0;i<3;i++) await armarContexto(t.env,t.db,brain,{consulta:'una canción sobre la noche y el eco en la ciudad',modo:null,anclas:[],profundidad:'normal'});
for(const prof of ['ligera','normal','profunda']){ const med=[];let ult; for(let i=0;i<8;i++){ const r=await cpu(()=>armarContexto(t.env,t.db,brain,{consulta:'una canción sobre la noche y el eco en la ciudad',modo:null,anclas:[],profundidad:prof}))(); med.push(r.ms); ult=r.r;} med.sort((a,b)=>a-b); console.log(`armarContexto (${prof}): mediana ${med[4]} ms de CPU · leyó ${ult.leidas.length} notas, ${ult.plan.chars+ult.plan.charsFijas} caracteres`); }
// lector SSE: respuesta de ~4000 tokens en trozos de ~3 caracteres, como el streaming real
const enc=new TextEncoder(); const trozos=[]; for(let i=0;i<3500;i++) trozos.push(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({type:'content_block_delta',index:0,delta:{type:'text_delta',text:' palabra'}})}\n\n`));
const L=lectorDeEventos(); const a=process.cpuUsage(); for(const c of trozos) L.empujar(c); const c=process.cpuUsage(a); console.log(`lectorDeEventos: ${((c.user+c.system)/1000).toFixed(1)} ms de CPU para 3500 eventos (${L.estado.texto.length} caracteres)`);
// desglose
const { grafoDe } = await import('../../src/graph.js');
const sig = await import('../../src/meaning.js');
const { adyacencia, activar } = await import('../../public/core/graph.js');
const med=async(n,f)=>{const xs=[];for(let i=0;i<8;i++){const a=process.cpuUsage();await f();const c=process.cpuUsage(a);xs.push((c.user+c.system)/1000)}xs.sort((a,b)=>a-b);console.log(`  ${n}: ${xs[4].toFixed(1)} ms`)};
console.log('desglose de armarContexto (CPU, mediana):');
await med('grafoDe (lee notas+enlaces y arma el grafo)',()=>grafoDe(t.db,brain.id));
const g=await grafoDe(t.db,brain.id);
await med('adyacencia + activar (2 saltos)',()=>{const adj=adyacencia(g);activar(g,new Map([['Nota 5',1],['Nota 40',0.8]]),{adj})});
await med('buscarSimilares (decodificar 364 vectores + producto)',()=>sig.buscarSimilares(t.env,t.db,brain,'noche eco ciudad'));
const {buscar}=await import('../../src/search.js');
await med('buscar completo (palabras + significado)',()=>buscar(t.env,t.db,brain,'una canción sobre la noche y el eco en la ciudad',{n:14}));
// lectura entre turnos: ¿lee lo mismo cuando el artista sigue la conversación?
const leer=async(q)=>(await armarContexto(t.env,t.db,brain,{consulta:q,modo:null,anclas:[],profundidad:'normal'})).leidas.map(x=>x.nombre);
const a1=await leer('Jingle emocional · un jingle sobre la noche y el eco · honesto');
const a2=await leer('hazla más corta y más directa');
const a3=await leer('cambia el segundo verso por algo con la ciudad');
const inter=(x,y)=>x.filter(n=>y.includes(n)).length;
console.log(`turno 1 (encargo): leyó ${a1.length} notas`);
console.log(`turno 2 («hazla más corta y más directa»): leyó ${a2.length} notas; en común con el turno 1: ${inter(a1,a2)}`);
console.log(`turno 3 («cambia el segundo verso…»): leyó ${a3.length} notas; en común con el turno 1: ${inter(a1,a3)}`);

/* ---------- fallos del proveedor y detección de modo ---------- */
import { BOVEDA_CHICA } from '../../tests/helpers.mjs';
import { detectarModo, modosDe } from '../../public/core/modes.js';
// 1) detección de modo con palabras cortas (modos inventados)
const modos=modosDe([{nombre:'M1',texto:'---\ntipo: modo\nmodo_nombre: Romántico\npalabras: amor, ex, corazon\n---\n'},{nombre:'M2',texto:'---\ntipo: modo\nmodo_nombre: Batalla\npalabras: batalla, tirar, diss\n---\n'}]);
for(const f of ['quiero un texto sobre una experiencia en el exterior','retirar la mano de la mesa','una canción de batalla']) { const d=detectarModo(f,modos); console.log('modo ·',JSON.stringify(f),'→',d.modo?.nombre||'ninguno','conf',d.confianza,d.motivo); }
// 2) fallos del proveedor
async function caso(nombre, fetchFn){ const t=await entorno({proveedor:fetchFn}); await t.j('POST','/api/brains/import',{cerebro:{slug:'p',nombre:'P',subtitulo:'x',color:'#94a3b8'}}); await t.j('POST','/api/b/p/import/notas',{notas:BOVEDA_CHICA});
 const chat=(await t.j('POST','/api/b/p/chats',{titulo:'x'})).datos.conversacion;
 const r=await t.flujo(`/api/b/p/chats/${chat.id}/message`,{fn:'chat',texto:'háblame de la anáfora',anclas:[],modo:null});
 await t.esperar(); const c=(await t.j('GET',`/api/b/p/chats/${chat.id}`)).datos.mensajes;
 console.log(`${nombre}: http ${r.status} · eventos: ${(r.eventos||[]).map(e=>e.evento).filter((e,i,a)=>a.indexOf(e)===i).join(',')} · fin=${JSON.stringify(r.fin||null)?.slice(0,40)} · en la base: ${c.map(m=>m.role+(m.meta?.error?'(error)':'')+':'+(m.content||'').length+'c').join(' ')}`); }
const sse=(partes)=>new Response(new ReadableStream({start(c){for(const p of partes)c.enqueue(enc.encode(p));c.close()}}),{status:200});
const delta=(t)=>`event: content_block_delta\ndata: ${JSON.stringify({type:'content_block_delta',index:0,delta:{type:'text_delta',text:t}})}\n\n`;
let n=0; const f529=async()=>{n++; return new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Overloaded'}}),{status:529})}; f529.peticiones=[];
await caso('529 «overloaded» (un solo intento)',Object.assign(async(u,i)=>{f529.peticiones.push(1);return f529()},{peticiones:f529.peticiones}));
const corte=async()=>sse([`event: message_start\ndata: ${JSON.stringify({type:'message_start',message:{usage:{input_tokens:900}}})}\n\n`,delta('La anáfora repite '),delta('al inicio de ')]); corte.peticiones=[];
await caso('conexión cortada a mitad de respuesta (sin message_stop)',corte);
const largo=async()=>sse([`event: message_start\ndata: ${JSON.stringify({type:'message_start',message:{usage:{input_tokens:900}}})}\n\n`,delta('[VERSO 1]\nUna línea que se corta'),`event: message_delta\ndata: ${JSON.stringify({type:'message_delta',delta:{stop_reason:'max_tokens'},usage:{output_tokens:4096}})}\n\n`,`event: message_stop\ndata: {"type":"message_stop"}\n\n`]); largo.peticiones=[];
await caso('respuesta cortada por max_tokens (4096)',largo);
