import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@adiwajshing/baileys'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ytdl from 'ytdl-core'

import { initDB, getUser, setUser, saveDB, getTopBy, getGroupCustom, addGroupCustom, removeGroupCustom, listGroupCustom } from './db.js'
import { makeSticker } from './sticker.js'
import { PROFESSIONS, STORE } from './config.js'
import { handleForca } from './games/forca.js'
import { handleRps } from './games/rps.js'

ffmpeg.setFfmpegPath(ffmpegStatic)

const logger = pino({ level: 'silent' })
await initDB()
const { state, saveCreds } = await useMultiFileAuthState('./auth')
const { version } = await fetchLatestBaileysVersion()
const sock = makeWASocket({ version, auth: state, printQRInTerminal: true, logger })
sock.ev.on('creds.update', saveCreds)

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }
function toNumberJid(num){ return num.includes('@') ? num : `${num}@s.whatsapp.net` }
function jidToNumber(jid){ return jid.replace(/@.+$/, '') }
function lvlForXP(xp){ return Math.floor(xp / 100) + 1 }
function fmtDate(ts){ const d=new Date(ts); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
function timeSince(ts){ const s=Math.floor((Date.now()-ts)/1000); const u=[[31536000,'ano'],[2592000,'mês'],[604800,'semana'],[86400,'dia'],[3600,'h'],[60,'min'],[1,'s']]; for(const [x,n] of u){ if(s>=x){const v=Math.floor(s/x); return `${v} ${n}${v>1&&n!=='h'?'s':''}`}} return 'agora' }
async function fetchBuffer(url){ const r=await fetch(url); const a=new Uint8Array(await r.arrayBuffer()); return Buffer.from(a) }

// ===== Downloader config (edit in download.config.json) =====
import fsPromises from 'fs/promises'
async function loadDownloaderConfig(){
  try{ return JSON.parse(await fsPromises.readFile('./download.config.json','utf8')) }
  catch{ return { tiktok:{endpoint:'',token:''}, pinterest:{endpoint:'',token:''} } }
}
async function httpGetBuffer(url, headers={}){ const res=await fetch(url,{headers}); if(!res.ok) throw new Error('HTTP '+res.status); const ab=await res.arrayBuffer(); return Buffer.from(new Uint8Array(ab)) }

// ===== Anti-flood =====
const lastCmdAt = new Map(), cmdWindow = new Map(), floodLockUntil = new Map(), lastStickerAt = new Map()
const COOLDOWN_MS=1500, WINDOW_MS=30000, WINDOW_MAX=10, FLOOD_LOCK_MS=30000
function canRunCommand(userId){
  const now=Date.now(), lock=floodLockUntil.get(userId)||0
  if (now<lock) return {ok:false, reason:`⌛ Anti-flood: aguarde ${Math.ceil((lock-now)/1000)}s.`}
  const last=lastCmdAt.get(userId)||0; if (now-last<COOLDOWN_MS) return {ok:false, reason:'⚠️ Aguarde 1.5s entre comandos.'}
  const arr=(cmdWindow.get(userId)||[]).filter(t=>now-t<WINDOW_MS); arr.push(now); cmdWindow.set(userId,arr)
  if (arr.length>WINDOW_MAX){ floodLockUntil.set(userId, now+FLOOD_LOCK_MS); cmdWindow.set(userId, []); return {ok:false, reason:'🚫 Flood detectado. Bloqueado por 30s.'} }
  lastCmdAt.set(userId, now); return {ok:true}
}
function canSendSticker(userId){ const now=Date.now(), last=lastStickerAt.get(userId)||0; if(now-last<1000) return false; lastStickerAt.set(userId, now); return true }

// ===== UI =====
function menuText(){
return `🟦🟦🟪🟪  𝗦𝗔𝗧𝗢𝗥𝗨 • 𝗠𝗘𝗡𝗨  🟪🟪🟦🟦

🟩 𝗣𝗘𝗥𝗙𝗜𝗟 & 𝗡𝗢𝗠𝗘
• .perfil
• .setname

🟨 𝗘𝗖𝗢𝗡𝗢𝗠𝗜𝗔 & 𝗟𝗢𝗝𝗔
• .work  • .aposta  • .roubar
• .loja  • .buy  • .inventario

🟥 𝗥𝗔𝗡𝗞𝗦
• .rank  • .rankbanco  • .rankprof
• .rankpau  • .rankgostosos

🟦 𝗝𝗢𝗚𝗢𝗦
• .rps  • .forca

🟪 𝗠𝗜́𝗗𝗜𝗔
• .audio  • .video  • .ajuda  • .menu

🟫 𝗖𝗢𝗠𝗔𝗡𝗗𝗢𝗦 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗢𝗦 (Admin)
• .pcadd  • .pclist  • .pcrmv

🖼️ 𝗦𝗧𝗜𝗖𝗞𝗘𝗥𝗦
• Envie uma IMAGEM — viro figurinha com seu nome

────────────────────────
☎️ 𝗦𝘂𝗽𝗼𝗿𝘁𝗲 𝗧𝗲́𝗰𝗻𝗶𝗰𝗼: (coloque seu número)
📧 𝗘𝗺𝗮𝗶𝗹 𝗼𝗳𝗶𝗰𝗶𝗮𝗹: (coloque seu email)

“Errou de novo? Calma… meu limite de paciência é quase tão baixo quanto seu XP.” — 𝙎𝙖𝙩𝙤𝙧𝙪 😌`
}

async function sendMenu(chatId, quoted){
  const img = fs.existsSync('./assets/menu.jpg') ? fs.readFileSync('./assets/menu.jpg') : null
  const caption = menuText()
  if (img) await sock.sendMessage(chatId, { image: img, caption }, { quoted })
  else await sock.sendMessage(chatId, { text: caption }, { quoted })
}

async function sendReaction(chatId, quoted){
  const pool = fs.readdirSync('./assets').filter(f=>/^reaction\d+\.jpg$/.test(f))
  if (pool.length){
    const img = fs.readFileSync(path.join('./assets', pick(pool)))
    await sock.sendMessage(chatId, { image: img, caption: "Hein? Comando inventado. Tenta `.menu` antes de passar vergonha. — Satoru 😏" }, { quoted })
  } else {
    await sock.sendMessage(chatId, { text:"Hein? Comando inventado. Tenta `.menu` antes de passar vergonha. — Satoru 😏" }, { quoted })
  }
}

// ===== Audio helpers =====
async function playAudioIfExists(chatId, filename){
  try{
    const p = `./assets/voice/${filename}`
    if (fs.existsSync(p)){
      const audio = fs.readFileSync(p)
      await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg' })
    }
  } catch {}
}
async function extractAudioFromVideoMessage(msg, chatId){
  const stream = await sock.downloadMediaMessage(msg, 'buffer')
  const inPath = './tmp_in.mp4', outPath = './tmp_out.mp3'
  fs.writeFileSync(inPath, stream)
  await new Promise((res,rej)=>{ ffmpeg(inPath).noVideo().audioCodec('libmp3lame').save(outPath).on('end',res).on('error',rej) })
  const audio = fs.readFileSync(outPath)
  await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg' })
  fs.unlinkSync(inPath); fs.unlinkSync(outPath)
}
async function audioFromYouTube(url, chatId){
  if (!ytdl.validateURL(url)){ await sock.sendMessage(chatId, { text:'Link inválido do YouTube.' }); return }
  const outPath = './yt_audio.mp3'
  await new Promise((res,rej)=>{
    const stream = ytdl(url, { quality:'highestaudio', filter:'audioonly' })
    ffmpeg(stream).audioCodec('libmp3lame').save(outPath).on('end',res).on('error',rej)
  })
  const audio = fs.readFileSync(outPath)
  await sock.sendMessage(chatId, { audio, mimetype:'audio/mpeg' })
  fs.unlinkSync(outPath)
}
async function audioFromGeneric(link, chatId){
  const cfg = await loadDownloaderConfig()
  let endpoint='', token=''
  if (/tiktok\.com/.test(link)){ endpoint = cfg.tiktok.endpoint; token = cfg.tiktok.token }
  else if (/pinterest\.com/.test(link)){ endpoint = cfg.pinterest.endpoint; token = cfg.pinterest.token }
  if (!endpoint){ await sock.sendMessage(chatId, { text:'Configure sua API em download.config.json para TikTok/Pinterest (sem marca d’água).' }); return }
  try{
    const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{'Authorization':`Bearer ${token}`}:{}) }, body: JSON.stringify({ url: link, noWatermark:true }) })
    if (!res.ok) throw new Error('Downloader falhou: '+res.status)
    const data = await res.json()
    const audioUrl = data.audio_no_wm || data.audio || data.url_audio
    if (!audioUrl) throw new Error('Resposta sem áudio')
    const buff = await httpGetBuffer(audioUrl)
    await sock.sendMessage(chatId, { audio: buff, mimetype:'audio/mpeg' })
  } catch(err){ await sock.sendMessage(chatId, { text:'Erro ao baixar áudio: '+err.message }) }
}
async function videoFromYouTube(url, chatId){
  if (!ytdl.validateURL(url)){ await sock.sendMessage(chatId, { text:'Link de YouTube inválido.' }); return }
  const outPath = './yt_video.mp4'
  await new Promise((resolve, reject)=>{ const stream = ytdl(url, { quality:'highestvideo' }); ffmpeg(stream).save(outPath).on('end', resolve).on('error', reject) })
  const vid = fs.readFileSync(outPath)
  await sock.sendMessage(chatId, { video: vid, caption:'🎬 Vídeo baixado com sucesso!' })
  fs.unlinkSync(outPath)
}
async function videoFromGeneric(link, chatId){
  const cfg = await loadDownloaderConfig()
  let endpoint='', token=''
  if (/tiktok\.com/.test(link)){ endpoint = cfg.tiktok.endpoint; token = cfg.tiktok.token }
  else if (/pinterest\.com/.test(link)){ endpoint = cfg.pinterest.endpoint; token = cfg.pinterest.token }
  if (!endpoint){ await sock.sendMessage(chatId, { text:'Configure sua API em download.config.json para TikTok/Pinterest (sem marca d’água).' }); return }
  try{
    const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{'Authorization':`Bearer ${token}`}:{}) }, body: JSON.stringify({ url: link, noWatermark:true }) })
    if (!res.ok) throw new Error('Downloader falhou: '+res.status)
    const data = await res.json()
    const url = data.url_no_wm || data.nowm || data.video_no_watermark || data.url || data.video
    if (!url) throw new Error('Resposta sem link de vídeo')
    const buff = await httpGetBuffer(url)
    await sock.sendMessage(chatId, { video: buff, caption:'🎬 Vídeo baixado (sem marca d’água, quando a API permitir).' })
  } catch(err){ await sock.sendMessage(chatId, { text:'Erro ao baixar vídeo: '+err.message }) }
}

// ===== Main =====
sock.ev.on('messages.upsert', async ({ messages, type })=>{
  if (type!=='notify') return
  const msg = messages[0]
  if (!msg?.message) return
  const chatId = msg.key.remoteJid
  const sender = msg.key.participant || msg.key.remoteJid
  const isGroup = chatId.endsWith('@g.us')
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

  // Stickers
  if (msg.message.imageMessage){
    if (!canSendSticker(sender)) return
    const buf = await sock.downloadMediaMessage(msg, 'buffer')
    const profile = await getUser(sender)
    const author = profile.name || msg.pushName || 'Usuário'
    const sticker = await makeSticker(buf, author, `${author}_sticker`)
    await sock.sendMessage(chatId, { sticker }, { quoted: msg })
    return
  }

  // Exec custom group commands (before parsing built-ins)
  if (isGroup && text.startsWith('.')){
    const trigger = text.slice(1).trim().split(/\s+/)[0].toLowerCase()
    const g = await getGroupCustom(chatId)
    const found = g.commands[trigger]
    if (found){ await sock.sendMessage(chatId, { text: found.msg }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
  }

  if (!text.startsWith('.')) return

  // Anti-flood
  const chk = canRunCommand(sender)
  if (!chk.ok){ await sock.sendMessage(chatId, { text: chk.reason }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }

  const parts = text.slice(1).trim().split(/\s+/)
  const cmd = (parts[0]||'').toLowerCase()
  const arg = parts.slice(1)

  // Menu / Ajuda
  if (cmd==='menu'){ await sendMenu(chatId, msg); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
  if (cmd==='ajuda'){
    const help =
`📖 𝗔𝗝𝗨𝗗𝗔 — Como usar
• .perfil — mostra seu perfil (com foto)
• .setname <nome> — nome nas figurinhas
• .setstatus <texto> — define status
• .work — trabalhar • .aposta <valor> • .roubar <numero>
• .loja <util|decor|casa> • .buy <cat> <id> • .inventario
• .rank • .rankbanco • .rankprof • .rankpau [@alvo] • .rankgostosos [@alvo]
• .rps <pedra|papel|tesoura> • .forca start / .forca g <letra>
• .audio <link YouTube> | responda um VÍDEO com .audio
• .video <link YouTube>
• (Admin) .pcadd <gatilho> | <mensagem> • .pclist • .pcrmv <gatilho>`
    await sock.sendMessage(chatId, { text: help }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Perfil & status
  if (cmd==='perfil'){
    const u = await getUser(sender)
    const numero = jidToNumber(sender)
    const nome = u.name || msg.pushName || 'Usuário'
    const level = u.level || 1, xp = u.xp || 0, coins=u.coins||0, bank=u.bank||0
    const job = u.job || 'Nenhuma', items=(u.items||[]).length
    const status = u.status || '—'
    const created = u.createdAt ? fmtDate(u.createdAt) : '—'
    const age = u.createdAt ? timeSince(u.createdAt) : '—'

    const caption =
`📱 *PERFIL DO JOGADOR*

👤 Nome: ${nome}
📞 Número: ${numero}

⭐ Level: ${level}   ✨ XP: ${xp}
💰 Coins: ${coins}   🏦 Banco: ${bank}

💼 Profissão: ${job}
🎒 Itens: ${items}
📝 Status: ${status}

🗓️ Conta criada em: ${created} (${age})

“Continue tentando… um dia talvez você chegue no meu nível.” — Satoru 🤭`

    try{
      const purl = await sock.profilePictureUrl(sender,'image')
      if (purl){
        const img = await fetchBuffer(purl)
        await sock.sendMessage(chatId, { image: img, caption }, { quoted: msg })
        await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
        return
      }
    }catch{}
    await sock.sendMessage(chatId, { text: caption }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='setstatus'){
    const texto = arg.join(' ').trim()
    if (!texto){ await sock.sendMessage(chatId, { text:'Use: .setstatus <sua frase estilosa>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const u = await getUser(sender); u.status = texto.slice(0,120); await saveDB()
    await sock.sendMessage(chatId, { text:`Status atualizado: “${u.status}”. Agora sim, com cara de jogador caro.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Setname
  if (cmd==='setname'){
    const name = arg.join(' ').trim()
    if (!name){ await sock.sendMessage(chatId, { text:'Use: .setname <nome>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    await setUser(sender, { name })
    await sock.sendMessage(chatId, { text:`Beleza, vou usar “${name}” nas suas figurinhas.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Economy & store
  if (cmd==='work'){
    const u = await getUser(sender); const now=Date.now(); u.cooldowns ||= {}
    if ((u.cooldowns.work||0) > now){
      const sec=Math.ceil((u.cooldowns.work-now)/1000)
      await sock.sendMessage(chatId, { text:`Calma, respira. Falta ${sec}s para trabalhar de novo.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
      return
    }
    const base=50+Math.floor(Math.random()*51), boost=(u.items||[]).reduce((s,it)=>s+(it.boost||0),0)
    const gain=Math.floor(base*(1+Math.min(boost,1)))
    u.coins=(u.coins||0)+gain; u.xp=(u.xp||0)+10; u.cooldowns.work=now+60*60*1000; await saveDB()
    await sock.sendMessage(chatId, { text:`Trampo feito (${u.job||'sem profissão'}). Você ganhou ${gain} coins. (Boost ${Math.round(Math.min(boost,1)*100)}%). XP +10. Nível ${lvlForXP(u.xp)}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  if (cmd==='aposta'){
    const val=parseInt(arg[0]||'0',10); const u=await getUser(sender)
    if (!val||val<1){ await sock.sendMessage(chatId, { text:'Use: .aposta <valor>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    if ((u.coins||0)<val){ await sock.sendMessage(chatId, { text:'Saldo insuficiente.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const win=Math.random()<0.5
    if (win){ u.coins+=val } else { u.coins-=val }
    await saveDB()
    await sock.sendMessage(chatId, { text: win?`Você ganhou! +${val}. Saldo ${u.coins}`:`Perdeu! -${val}. Saldo ${u.coins}` }, { quoted: msg })
    await playAudioIfExists(chatId, win?'(2) Execução de Comandos.mp3':'(3) Erro de Execução de Comandos.mp3')
    return
  }

  if (cmd==='roubar' || cmd==='steal'){
    const num=(arg[0]||'').replace(/[^0-9]/g,'')
    if (!num){ await sock.sendMessage(chatId, { text:'Use: .roubar <numero_com_ddd>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const attacker=await getUser(sender), victim=await getUser(toNumberJid(num))
    if ((victim.coins||0)<50){ await sock.sendMessage(chatId, { text:'Alvo com pouco dinheiro.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const success=Math.random()<0.4
    if (success){
      const stolen=Math.min(victim.coins, Math.floor(Math.random()*Math.floor(victim.coins*0.3)))
      victim.coins-=stolen; attacker.coins=(attacker.coins||0)+stolen; await saveDB()
      await sock.sendMessage(chatId, { text:`Roubo bem-sucedido! Pegou ${stolen} coins.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    } else {
      const penalty=Math.min(attacker.coins||0, 20); attacker.coins=(attacker.coins||0)-penalty; await saveDB()
      await sock.sendMessage(chatId, { text:`Falhou! Multa de ${penalty} coins.` }, { quoted: msg })
      await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
    }
    return
  }

  if (cmd==='rank'){
    const top = await getTopBy('coins', 5)
    const body = top.length ? top.map((x,i)=>`${i+1}. ${x.id} — ${x.v} coins`).join('\n') : 'Ninguém ainda.'
    await sock.sendMessage(chatId, { text:`🏆 RANK\n${body}` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return
  }
  if (cmd==='rankbanco' || cmd==='rankbank'){
    const top = await getTopBy('bank', 5)
    const body = top.length ? top.map((x,i)=>`${i+1}. ${x.id} — ${x.v} bank`).join('\n') : 'Ninguém ainda.'
    await sock.sendMessage(chatId, { text:`🏦 RANK BANCO\n${body}` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return
  }
  if (cmd==='rankprof' || cmd==='rankprofissao'){
    const data=(await (await import('./db.js')).default).data
    const map={}; for(const [id,u] of Object.entries(data.users||{})){ if(!u.job) continue; map[u.job]=(map[u.job]||0)+(u.coins||0) }
    const list = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([job,coins],i)=>`${i+1}. ${job} — ${coins}`).join('\n') || '—'
    await sock.sendMessage(chatId, { text:`👔 RANK POR PROFISSÃO\n${list}` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return
  }
  if (cmd==='rankgay'){ await sock.sendMessage(chatId, { text:'Não vou criar comandos que avaliem alguém pela orientação sexual. Use `.rank`, `.rankbanco`, `.rankprof` ou as brincadeiras `.rankpau` / `.rankgostosos`.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
  if (cmd==='rankpau' || cmd==='rankgostosos'){
    const alvo=arg[0]||''; const pct=Math.floor(Math.random()*101)
    let joke=''; if(pct>80) joke='Absurdo. Já pode abrir fã clube.'; else if(pct>50) joke='Respeitável, tá na média alta.'; else if(pct>20) joke='É… dá pra melhorar, digamos.'; else joke='Ih… deixa pra próxima, campeão.'
    await sock.sendMessage(chatId, { text:`${cmd.toUpperCase()} ${alvo}\n${pct}% — ${joke}` }, { quoted: msg })
    await playAudioIfExists(chatId, pct<20 ? '(5) Você é Fraco.mp3' : '(2) Execução de Comandos.mp3')
    return
  }

  // Games
  if (cmd==='rps'){ await handleRps(text.slice(1), sock, chatId, msg); return }
  if (cmd==='forca'){ await handleForca(text.slice(1), sock, chatId, msg); return }

  // Store
  if (cmd==='loja'){
    const cat=(arg[0]||'').toLowerCase()
    const valid=['util','decor','casa']
    if (!valid.includes(cat)){ await sock.sendMessage(chatId, { text:'Categorias: util | decor | casa' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const arr = (await import('./config.js')).STORE[cat]
    const list = arr.map(i=>`${i.id}. ${i.name} (${i.price})`).join('\n')
    await sock.sendMessage(chatId, { text:`🛒 Loja ${cat}\n${list}\nUse: .buy ${cat} <id>` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='buy'){
    const cat=(arg[0]||'').toLowerCase(); const id=parseInt(arg[1]||'0',10)
    const arr = (await import('./config.js')).STORE[cat]||[]; const sel=arr.find(i=>i.id===id)
    if (!sel){ await sock.sendMessage(chatId, { text:'Use: .buy <categoria> <id>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const u=await getUser(sender)
    if ((u.coins||0) < sel.price){ await sock.sendMessage(chatId, { text:'Moedas insuficientes.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    u.coins -= sel.price; u.items=u.items||[]; u.items.push({ cat, name: sel.name, boost: sel.boost||0 }); await saveDB()
    await sock.sendMessage(chatId, { text:`Comprou ${sel.name} por ${sel.price}.` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }
  if (cmd==='inventario'){
    const u=await getUser(sender); const inv=(u.items||[]).map((x,i)=>`${i+1}. ${x.cat}:${x.name}`).join('\n') or 'Vazio.'
    await sock.sendMessage(chatId, { text:`🎒 Inventário\n${inv}` }, { quoted: msg })
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
    return
  }

  // Audio/Video
  if (cmd==='audio'){
    const link=arg[0]||''
    if (link){ if (/youtube\.com|youtu\.be/.test(link)) await audioFromYouTube(link, chatId); else await audioFromGeneric(link, chatId); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
    const ctx=msg.message?.extendedTextMessage?.contextInfo; const quoted=ctx?.quotedMessage?.videoMessage
    if (quoted){ const q={ key:{...msg.key, id: ctx.stanzaId}, message:{ videoMessage: quoted } }; await extractAudioFromVideoMessage(q, chatId); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return }
    await sock.sendMessage(chatId, { text:'Use: .audio <link> ou responda um VÍDEO com .audio' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return
  }
  if (cmd==='video'){
    const link=arg[0]||''
    if (!link){ await sock.sendMessage(chatId, { text:'Use: .video <link YouTube/TikTok/Pinterest>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    if (/youtube\.com|youtu\.be/.test(link)) await videoFromYouTube(link, chatId); else await videoFromGeneric(link, chatId)
    await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3'); return
  }

  // Admin-only custom commands
  if (['pcadd','pclist','pcrmv'].includes(cmd)){
    if (!isGroup){ await sock.sendMessage(chatId, { text:'Somente em grupo.' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
    const meta = await sock.groupMetadata(chatId)
    const admins = meta.participants.filter(p=>p.admin).map(p=>p.id)
    const isAdmin = admins.includes(sender)
    if (!isAdmin){ await sock.sendMessage(chatId, { text:'Apenas administradores podem usar este comando.' }, { quoted: msg }); await playAudioIfExists(chatId, '(4) Tentativa de Execução de Comandos Vips.mp3'); return }

    if (cmd==='pcadd'){
      const raw = arg.join(' ').split('|')
      if (raw.length<2){ await sock.sendMessage(chatId, { text:'Use: .pcadd <gatilho> | <mensagem>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const trigger = raw[0].trim().toLowerCase().replace(/^\./,''); const message = raw.slice(1).join('|').trim()
      if (!trigger||!message){ await sock.sendMessage(chatId, { text:'Use: .pcadd <gatilho> | <mensagem>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const r = await addGroupCustom(chatId, sender, trigger, message)
      if (!r.ok){ await sock.sendMessage(chatId, { text:`Falhou: ${r.reason}` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3') }
      else { await sock.sendMessage(chatId, { text:`Comando .${trigger} criado.` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3') }
      return
    }
    if (cmd==='pclist'){
      const list = await listGroupCustom(chatId)
      const body = list.length ? list.map((c,i)=>`${i+1}. .${c.trigger}`).join('\n') : 'Nenhum.'
      await sock.sendMessage(chatId, { text:`🧩 Comandos personalizados do grupo:\n${body}` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3')
      return
    }
    if (cmd==='pcrmv'){
      const trigger=(arg[0]||'').toLowerCase().replace(/^\./,'')
      if (!trigger){ await sock.sendMessage(chatId, { text:'Use: .pcrmv <gatilho>' }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3'); return }
      const meta2 = await sock.groupMetadata(chatId)
      const admins2 = meta2.participants.filter(p=>p.admin).map(p=>p.id)
      const isGroupAdmin = admins2.includes(sender)
      const r = await removeGroupCustom(chatId, sender, trigger, isGroupAdmin)
      if (!r.ok){ await sock.sendMessage(chatId, { text:`Falhou: ${r.reason}` }, { quoted: msg }); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3') }
      else { await sock.sendMessage(chatId, { text:`Comando .${trigger} removido.` }, { quoted: msg }); await playAudioIfExists(chatId, '(2) Execução de Comandos.mp3') }
      return
    }
  }

  // Unknown
  await sendReaction(chatId, msg); await playAudioIfExists(chatId, '(3) Erro de Execução de Comandos.mp3')
})

console.log('✅ Satoru Bot FINAL pronto. Escaneie o QR.')
