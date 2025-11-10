export async function handleRps(cmd, sock, chatId, quoted){
  const parts = cmd.split(/\s+/)
  const choice = (parts[1]||'').toLowerCase()
  const choices = ['pedra','papel','tesoura']
  if (!choices.includes(choice)){
    await sock.sendMessage(chatId, { text:'Use: .rps pedra|papel|tesoura' }, { quoted })
    return
  }
  const cpu = choices[Math.floor(Math.random()*3)]
  let result='Empate'
  if (choice!==cpu){
    if ((choice==='pedra'&&cpu==='tesoura')||(choice==='tesoura'&&cpu==='papel')||(choice==='papel'&&cpu==='pedra')) result='Você ganhou'
    else result='Você perdeu'
  }
  const body = `Você: ${choice}\nCPU: ${cpu}\nResultado: ${result}`
  await sock.sendMessage(chatId, { text: body }, { quoted })
}
