import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const adapter = new JSONFile('db.json')
const db = new Low(adapter, { users:{}, games:{} })

const WORDS = ['banana','programacao','javascript','amazonia','livro','computador']

export async function handleForca(cmd, sock, chatId, quoted){
  await db.read()
  db.data ||= { users:{}, games:{} }
  const parts = cmd.split(/\s+/)
  const game = db.data.games[chatId] || null

  if (parts[1]==='start'){
    const palavra = WORDS[Math.floor(Math.random()*WORDS.length)]
    db.data.games[chatId] = { palavra, guessed:Array(palavra.length).fill('_'), tries:6, letters:[] }
    await db.write()
    await sock.sendMessage(chatId, { text:`Forca iniciada! Palavra: ${db.data.games[chatId].guessed.join(' ')}\nUse: .forca g <letra>` }, { quoted })
    return
  }

  if (parts[1]==='g' && parts[2]){
    if (!game){ await sock.sendMessage(chatId, { text:'Nenhum jogo em andamento. Use: .forca start' }, { quoted }); return }
    const letter = parts[2].toLowerCase()
    if (game.letters.includes(letter)){ await sock.sendMessage(chatId, { text:'Letra já tentada.' }, { quoted }); return }
    game.letters.push(letter)
    let hit = false
    for (let i=0;i<game.palavra.length;i++){ if (game.palavra[i]===letter){ game.guessed[i]=letter; hit=true } }
    if (!hit) game.tries--
    if (game.guessed.join('')===game.palavra){
      await sock.sendMessage(chatId, { text:`Parabéns! Palavra: ${game.palavra}` }, { quoted })
      delete db.data.games[chatId]
    } else if (game.tries<=0){
      await sock.sendMessage(chatId, { text:`Você perdeu. Palavra: ${game.palavra}` }, { quoted })
      delete db.data.games[chatId]
    } else {
      await sock.sendMessage(chatId, { text:`Palavra: ${game.guessed.join(' ')}\nTentativas: ${game.tries}` }, { quoted })
    }
    await db.write()
    return
  }

  await sock.sendMessage(chatId, { text:'Comandos Forca:\n.forca start\n.forca g <letra>' }, { quoted })
}
