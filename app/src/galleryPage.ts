// One-file "choose your photos" page for a client. Host it anywhere static (Vercel, Netlify Drop...).
// There is no server: the client's picks stay in their browser and leave as a text code they send back
// (LINE, Zalo, email...). The studio pastes that code into the app ("Nhập lựa chọn của khách").

export interface GalleryPhoto { base: string; src?: string; color?: string }
export interface GalleryOpts {
  id: string; title: string; studio: string; limit: number; expires: string; password: string;
  photos: GalleryPhoto[]; note?: string; contactEmail?: string;
  api?: string; // base URL of the studio server; when set, picks are also sent there automatically
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");

export const PICK_HEADER = "STUDIO-PICK";

export function galleryHtml(o: GalleryOpts): string {
  const data = js({ id: o.id, title: o.title, limit: o.limit, expires: o.expires, pw: o.password, mail: o.contactEmail ?? "", api: o.api ?? "", photos: o.photos });
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(o.title)} · chọn ảnh</title>
<style>
:root{--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--muted:#6e6e73;--line:#d2d2d7;--accent:#0071e3;--heart:#ff2d55;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--text:#f5f5f7;--muted:#98989d;--line:#38383a;--accent:#0a84ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;padding-bottom:84px}
header{padding:28px 16px 10px;max-width:1100px;margin:0 auto}h1{font-size:26px;margin:2px 0}small,.muted{color:var(--muted)}
.brand{letter-spacing:.16em;font-size:12px;font-weight:600;color:var(--muted)}
.bar{display:flex;gap:8px;max-width:1100px;margin:0 auto;padding:8px 16px;flex-wrap:wrap;align-items:center}
button{font:inherit;border:0;border-radius:10px;padding:10px 16px;min-height:44px;cursor:pointer;background:var(--card);color:var(--text);border:1px solid var(--line)}
button.on{background:var(--accent);color:#fff;border-color:var(--accent)}button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}button:disabled{opacity:.45;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-width:1100px;margin:0 auto;padding:8px 16px}
.t{position:relative;aspect-ratio:3/2;border-radius:10px;overflow:hidden;background:#8e8e93;cursor:zoom-in}.t img{width:100%;height:100%;object-fit:cover;display:block}
.t.sel{outline:3px solid var(--heart);outline-offset:-3px}
.t .nm{position:absolute;left:6px;bottom:4px;font-size:11px;color:#fff;text-shadow:0 1px 3px #000a}
.h{position:absolute;right:6px;top:6px;width:44px;height:44px;border-radius:50%;padding:0;display:grid;place-items:center;background:#0006;border:0;color:#fff;backdrop-filter:blur(6px)}
.h svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2}.t.sel .h{background:var(--heart)}.t.sel .h svg{fill:#fff}
.foot{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(16px);border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom))}
.foot div{max-width:1100px;margin:0 auto;display:flex;gap:12px;align-items:center}.foot .meter{flex:1;height:6px;border-radius:3px;background:var(--line);overflow:hidden}.meter i{display:block;height:100%;background:var(--heart);width:0}
.ov{position:fixed;inset:0;background:#000d;display:none;z-index:5;align-items:center;justify-content:center;padding:12px}.ov.show{display:flex}
.ov img{max-width:100%;max-height:82vh;border-radius:8px}.lb{flex-direction:column;gap:10px;color:#fff}.lb .row{display:flex;gap:10px;align-items:center}
.box{background:var(--card);border-radius:16px;padding:20px;max-width:520px;width:100%;max-height:88vh;overflow:auto}.box textarea{width:100%;height:150px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);padding:10px;font:13px ui-monospace,monospace}
.box .row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}input[type=password]{font:inherit;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);width:100%;margin:10px 0}
</style></head><body>
<header><div class="brand">${esc(o.studio.toUpperCase())}</div><h1>${esc(o.title)}</h1><small id="sub"></small>${o.note ? `<p class="muted">${esc(o.note)}</p>` : ""}</header>
<div class="bar"><button id="fAll" class="on">Tất cả</button><button id="fSel">Đã chọn</button></div>
<main class="grid" id="grid"></main>
<div class="foot"><div><strong id="cnt"></strong><span class="meter"><i id="mt"></i></span><button class="primary" id="done">Gửi lựa chọn</button></div></div>
<div class="ov lb" id="lb"><img id="lbi" alt=""><div class="row"><button id="pv">‹</button><button id="lbh"></button><button id="nx">›</button><button id="cl">Đóng</button></div><small id="lbn"></small></div>
<div class="ov" id="gate"><div class="box"><h2 style="margin:0">Nhập mật khẩu</h2><p class="muted">Mật khẩu studio đã gửi kèm đường dẫn.</p><input type="password" id="pw" autocomplete="off"><button class="primary" id="go">Mở ảnh</button> <small id="pe" style="color:var(--heart)"></small></div></div>
<div class="ov" id="out"><div class="box"><h2 style="margin:0">Gửi lựa chọn cho studio</h2><p class="muted" id="os"></p><textarea id="ot" readonly></textarea><div class="row"><button class="primary" id="oc">Sao chép</button><button id="osh">Chia sẻ</button><button id="ol">LINE</button><button id="om">Email</button><button id="od">Tải .txt</button></div><p class="muted">Dán đoạn trên vào tin nhắn gửi studio. Bạn vẫn có thể đóng cửa sổ này để chọn lại.</p><button id="ox">Đóng</button></div></div>
<script>
var D=${data},K="pick-"+D.id,$=function(i){return document.getElementById(i)};
var sel={},f="all",cur=0,vis=[];try{sel=JSON.parse(localStorage.getItem(K)||"{}")}catch(e){}
var save=function(){try{localStorage.setItem(K,JSON.stringify(sel))}catch(e){}};
var n=function(){return Object.keys(sel).length};
var HEART='<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9.2C1.6 7.2 4 4.5 7 4.5c1.9 0 3.2 1 5 3 1.8-2 3.1-3 5-3 3 0 5.4 2.7 4 6.3C19 15.6 12 20 12 20z"/></svg>';
var expired=D.expires&&new Date().toISOString().slice(0,10)>D.expires;
$("sub").textContent=D.photos.length+" ảnh · chọn tối đa "+D.limit+(D.expires?" · hạn "+D.expires:"")+(expired?" (đã hết hạn)":"");
function toggle(b){if(expired)return;if(sel[b])delete sel[b];else{if(n()>=D.limit){alert("Bạn đã chọn đủ "+D.limit+" ảnh. Bỏ một ảnh để chọn ảnh khác.");return}sel[b]=1}save();draw()}
function tile(p,i){var d=document.createElement("div");d.className="t"+(sel[p.base]?" sel":"");d.style.background=p.color||"#8e8e93";
 if(p.src){var im=document.createElement("img");im.src=p.src;im.loading="lazy";im.alt=p.base;d.appendChild(im)}
 var nm=document.createElement("span");nm.className="nm";nm.textContent=p.base;d.appendChild(nm);
 var h=document.createElement("button");h.className="h";h.innerHTML=HEART;h.setAttribute("aria-label","Chọn "+p.base);h.onclick=function(e){e.stopPropagation();toggle(p.base)};d.appendChild(h);
 d.onclick=function(){open(i)};return d}
function draw(){vis=D.photos.filter(function(p){return f==="all"||sel[p.base]});var g=$("grid");g.innerHTML="";vis.forEach(function(p,i){g.appendChild(tile(p,i))});
 $("cnt").textContent=n()+" / "+D.limit+" ảnh";$("mt").style.width=Math.min(100,n()/D.limit*100)+"%";$("done").disabled=n()===0;
 $("fAll").className=f==="all"?"on":"";$("fSel").className=f==="sel"?"on":"";$("fSel").textContent="Đã chọn "+n();if(!vis.length)g.innerHTML='<p class="muted" style="grid-column:1/-1">Chưa có ảnh nào.</p>'}
function open(i){cur=i;var p=vis[i];if(!p)return;$("lbi").src=p.src||"";$("lbn").textContent=p.base+"  ("+(i+1)+"/"+vis.length+")";$("lbh").textContent=sel[p.base]?"♥ Đã chọn":"♡ Chọn ảnh này";$("lbh").className=sel[p.base]?"on":"";$("lb").className="ov lb show"}
$("cl").onclick=function(){$("lb").className="ov lb"};$("pv").onclick=function(){open((cur+vis.length-1)%vis.length)};$("nx").onclick=function(){open((cur+1)%vis.length)};
$("lbh").onclick=function(){var b=vis[cur].base;toggle(b);open(Math.min(cur,vis.length-1))};
document.onkeydown=function(e){if($("lb").className.indexOf("show")<0)return;if(e.key==="Escape")$("cl").onclick();if(e.key==="ArrowLeft")$("pv").onclick();if(e.key==="ArrowRight")$("nx").onclick()};
$("fAll").onclick=function(){f="all";draw()};$("fSel").onclick=function(){f="sel";draw()};
function code(){return "${PICK_HEADER}|"+D.id+"|"+n()+"\\n"+Object.keys(sel).sort().join(", ")}
$("done").onclick=function(){var t=code();$("ot").value=t;$("os").textContent="Bạn đã chọn "+n()+" ảnh.";$("out").className="ov show";
 if(D.api){$("os").textContent+=" Đang gửi cho studio…";fetch(D.api+"/api/pick",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:D.id,names:Object.keys(sel)})}).then(function(r){if(!r.ok)throw 0;$("os").textContent="Đã gửi "+n()+" ảnh cho studio ✓. Bạn có thể đóng trang, hoặc sửa lại rồi gửi lần nữa."}).catch(function(){$("os").textContent="Chưa gửi tự động được. Hãy sao chép đoạn bên dưới và gửi cho studio."})}};
$("ox").onclick=function(){$("out").className="ov"};
$("oc").onclick=function(){$("ot").select();try{navigator.clipboard.writeText($("ot").value).then(function(){$("oc").textContent="Đã chép ✓"})}catch(e){document.execCommand("copy");$("oc").textContent="Đã chép ✓"}};
$("osh").onclick=function(){if(navigator.share)navigator.share({title:D.title,text:$("ot").value}).catch(function(){});else $("oc").onclick()};
$("ol").onclick=function(){location.href="https://line.me/R/share?text="+encodeURIComponent($("ot").value)};
$("om").onclick=function(){location.href="mailto:"+D.mail+"?subject="+encodeURIComponent("Ảnh chọn: "+D.title)+"&body="+encodeURIComponent($("ot").value)};
$("od").onclick=function(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([$("ot").value],{type:"text/plain"}));a.download="chon-anh-"+D.id+".txt";a.click()};
function start(){$("gate").className="ov";draw()}
if(D.pw){var ok=false;try{ok=sessionStorage.getItem("ok-"+D.id)==="1"}catch(e){}
 if(ok)start();else{$("gate").className="ov show";var tryPw=function(){if($("pw").value===D.pw){try{sessionStorage.setItem("ok-"+D.id,"1")}catch(e){}start()}else $("pe").textContent="Sai mật khẩu"};$("go").onclick=tryPw;$("pw").onkeydown=function(e){if(e.key==="Enter")tryPw()}}}
else start();
</script></body></html>`;
}

// Read the code a client sent back: header line (optional) + file names separated by comma, space or new line.
export function parsePick(text: string): { id?: string; names: string[] } {
  const lines = text.split(/\r?\n/);
  let id: string | undefined;
  const h = lines[0]?.trim().split("|");
  if (h && h[0] === PICK_HEADER) { id = h[1]; lines.shift(); }
  const names = lines.join(",").split(/[,;\s]+/).map((s) => s.trim().replace(/\.(jpe?g|png|cr2|cr3|nef|arw|raf|dng|orf|rw2)$/i, "")).filter(Boolean);
  return { id, names: [...new Set(names)] };
}
