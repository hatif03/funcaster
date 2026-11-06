import fs from "node:fs";
import path from "node:path";
const slug = process.argv[2];
if (!/^[a-z][a-z0-9-]{1,40}$/.test(slug || ""))
  throw Error("Use a short lowercase name: npm run game:create -- my-game");
const namespaceIndex = process.argv.indexOf("--namespace");
const namespace =
  namespaceIndex < 0 ? "creator" : process.argv[namespaceIndex + 1];
if (
  !/^[a-z][a-z0-9-]{1,39}$/.test(namespace || "") ||
  ["chonks", "system"].includes(namespace)
)
  throw Error("Choose your own lowercase namespace");
const dir = path.resolve("creator-games", slug);
if (fs.existsSync(dir))
  throw Error("That game already exists. Choose a new name.");
fs.mkdirSync(dir, { recursive: true });
const manifest = {
  schemaVersion: 2,
  gameId: `${namespace}.${slug}`,
  version: "0.1.0",
  title: slug,
  view: "shared",
  verification: "casual",
  scoring: { direction: "higher", unit: "points" },
  controller: "aim",
  modes: {
    solo: { minHumans: 1, maxHumans: 1, aiDefault: 0 },
    multiplayer: { minHumans: 2, maxHumans: 4, aiDefault: 0 },
  },
  topologies: ["shared"],
  license: "MIT",
};
fs.writeFileSync(
  path.join(dir, "game.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.mkdirSync(path.join(dir, "sdk"));
fs.writeFileSync(
  path.join(dir, "sdk/lifecycle.js"),
  fs
    .readFileSync(new URL("../sdk/lifecycle.js", import.meta.url), "utf8")
    .replace("../core/fixed-step.js", "./fixed-step.js"),
);
fs.copyFileSync(
  new URL("../core/fixed-step.js", import.meta.url),
  path.join(dir, "sdk/fixed-step.js"),
);
fs.writeFileSync(
  path.join(dir, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${slug}</title><link rel="stylesheet" href="style.css"><header><h1>${slug}</h1><p>Move the circle onto the stars. Pointer or arrow keys. 30 seconds.</p><button id="start">Start game</button><output id="score">Ready</output></header><canvas aria-label="Catch the stars" tabindex="0"></canvas><script type="module" src="game.js"></script></html>`,
);
fs.writeFileSync(
  path.join(dir, "style.css"),
  `body{margin:0;background:#14251f;color:#fff1d6;font:18px system-ui}header{padding:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap}h1,p{margin:0}button{padding:16px 24px;background:#f7c600;color:#14251f;border:0;border-radius:12px;font:inherit}canvas{display:block;width:100%;height:65vh;touch-action:none}output{font-weight:bold}`,
);
fs.writeFileSync(
  path.join(dir, "game.js"),
  `import {GameRuntime} from './sdk/lifecycle.js';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),score=document.querySelector('output'),start=document.querySelector('button');let runtime,last=performance.now(),x=.5,y=.5,t=0,points=0,target={x:.2,y:.2};const keys=new Set();
const game={init(){x=y=.5;t=points=0;target={x:.2,y:.2};},step(dt){t+=dt;x=Math.max(.02,Math.min(.98,x+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*.5));y=Math.max(.02,Math.min(.98,y+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt*.5));if(Math.hypot(x-target.x,y-target.y)<.08){points+=10;target={x:.1+((points*137)%800)/1000,y:.1+((points*239)%800)/1000};}score.textContent=points+' points · '+Math.max(0,Math.ceil(30-t))+'s';if(t>=30)runtime.finish();},render(){canvas.width=canvas.clientWidth;canvas.height=canvas.clientHeight;ctx.fillStyle='#21392e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f7c600';ctx.font='40px system-ui';ctx.fillText('★',target.x*canvas.width-20,target.y*canvas.height+14);ctx.fillStyle='#4de2df';ctx.beginPath();ctx.arc(x*canvas.width,y*canvas.height,18,0,Math.PI*2);ctx.fill();},result(){return [{slot:0,score:points}];}};
start.onclick=()=>{runtime?.dispose();runtime=new GameRuntime(game,{seats:[0],seed:1,setup:{}},{onResult:()=>{score.textContent=points+' points · Round complete';start.disabled=false;start.textContent='Play again';}});runtime.start();start.disabled=true;canvas.focus();};
canvas.onpointermove=e=>{const r=canvas.getBoundingClientRect();x=(e.clientX-r.left)/r.width;y=(e.clientY-r.top)/r.height;};window.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();keys.add(e.key);}};window.onkeyup=e=>keys.delete(e.key);window.onblur=()=>keys.clear();
function frame(now){requestAnimationFrame(frame);runtime?.advance(Math.min(.05,(now-last)/1000));last=now;}requestAnimationFrame(frame);window.addEventListener('pagehide',()=>runtime?.dispose());`,
);
console.log(
  `Created ${dir}. Validate: npm run game:validate -- ${dir}. Preview: npm run game:preview -- ${dir}`,
);
