import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const adapter = new JSONFile('db.json')
const db = new Low(adapter, { users:{}, games:{}, scores:{}, custom:{} })

export async function initDB(){
  await db.read()
  db.data ||= { users:{}, games:{}, scores:{}, custom:{} }
  await db.write()
}

export async function getUser(id){
  await db.read()
  db.data.users ||= {}
  db.data.users[id] ||= {
    name: null, coins: 100, job: null, items: [], xp: 0, level: 1, bank: 0,
    rpsWins: 0, forcaWins: 0, cooldowns: {}, status: '', createdAt: null
  }
  if (!db.data.users[id].createdAt) db.data.users[id].createdAt = Date.now()
  await db.write()
  return db.data.users[id]
}

export async function setUser(id, obj){
  await db.read()
  db.data.users ||= {}
  db.data.users[id] = Object.assign(await getUser(id), obj)
  await db.write()
  return db.data.users[id]
}

export async function saveDB(){ await db.write() }

export async function getGroupCustom(groupId){
  await db.read()
  db.data.custom ||= {}
  db.data.custom[groupId] ||= { commands:{} }
  await db.write()
  return db.data.custom[groupId]
}

export async function addGroupCustom(groupId, creatorId, trigger, message){
  await db.read()
  db.data.custom ||= {}
  db.data.custom[groupId] ||= { commands:{} }
  const g = db.data.custom[groupId]
  const createdByAdmin = Object.values(g.commands).filter(c => c.creator === creatorId).length
  if (createdByAdmin >= 10) return { ok:false, reason:'Limite de 10 comandos por admin neste grupo.' }
  if (g.commands[trigger]) return { ok:false, reason:'Já existe um comando com esse gatilho.' }
  g.commands[trigger] = { msg: message, creator: creatorId, createdAt: Date.now() }
  await db.write()
  return { ok:true }
}

export async function removeGroupCustom(groupId, requesterId, trigger, isRequesterGroupAdmin){
  await db.read()
  db.data.custom ||= {}
  const g = db.data.custom[groupId]
  if (!g || !g.commands[trigger]) return { ok:false, reason:'Gatilho não encontrado.' }
  const owner = g.commands[trigger].creator
  if (owner !== requesterId && !isRequesterGroupAdmin){
    return { ok:false, reason:'Apenas o criador ou um admin do grupo pode remover.' }
  }
  delete g.commands[trigger]
  await db.write()
  return { ok:true }
}

export async function listGroupCustom(groupId){
  await db.read()
  db.data.custom ||= {}
  const g = db.data.custom[groupId] || { commands:{} }
  return Object.entries(g.commands).map(([t,info])=>({ trigger:t, creator: info.creator }))
}

export async function getTopBy(field, limit=5){
  await db.read()
  const arr = Object.entries(db.data.users||{}).map(([id,u])=>({id, v: u[field]||0}))
  arr.sort((a,b)=>b.v-a.v)
  return arr.slice(0,limit)
}

export default db
