import pkg from '@adiwajshing/baileys'
const makeWASocket = pkg.default || pkg
const { useMultiFileAuthState, fetchLatestBaileysVersion } = pkg
import pino from 'pino'
import util from 'util'
import https from 'https'
import dns from 'dns/promises'

const logger = pino({ level: 'silent' })
const { state, saveCreds } = await useMultiFileAuthState('./auth')
const { version } = await fetchLatestBaileysVersion()
const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger })

sock.ev.on('creds.update', saveCreds)

async function quickChecks(){
  try {
    console.log('\n[diagnostics] System time:', new Date().toString())
    console.log('[diagnostics] HTTP_PROXY:', process.env.HTTP_PROXY || process.env.http_proxy || '')
    console.log('[diagnostics] HTTPS_PROXY:', process.env.HTTPS_PROXY || process.env.https_proxy || '')

    // DNS lookup
    try {
      const addrs = await dns.lookup('web.whatsapp.com', { all: true })
      console.log('[diagnostics] DNS lookup web.whatsapp.com:', addrs)
    } catch (e){
      console.log('[diagnostics] DNS lookup failed:', e && e.message)
    }

    // Quick HTTPS fetch to check TLS/HTTP reachability
    await new Promise((resolve) => {
      const req = https.get('https://web.whatsapp.com', (res) => {
        console.log('[diagnostics] HTTPS GET web.whatsapp.com statusCode:', res.statusCode)
        // print a bit of TLS info if available
        try { console.log('[diagnostics] TLS peer certificate:', res.socket.getPeerCertificate && res.socket.getPeerCertificate()) } catch(e){}
        res.on('data', () => {})
        res.on('end', () => resolve())
      })
      req.on('error', (err) => {
        console.log('[diagnostics] HTTPS GET error:', err && err.message)
        resolve()
      })
      req.setTimeout(8000, () => { req.destroy(); resolve() })
    })
  } catch (err){
    console.log('[diagnostics] quickChecks error:', err && err.stack)
  }
}

sock.ev.on('connection.update', async (update) => {
  console.log('connection.update:', update)
  const qr = update.qr
  const status = update.connection

  if (qr){
    console.log('\n=== QR string below (scan this with WhatsApp): ===')
    console.log(qr)
    import('qrcode-terminal').then(qrterm => qrterm.generate(qr, { small: true }))
  }

  if (update.lastDisconnect){
    console.log('\n[lastDisconnect] Detailed info:')
    try {
      // print a deep inspection of the error object
      console.log(util.inspect(update.lastDisconnect, { depth: null }))
    } catch (e){
      console.log('Could not inspect lastDisconnect:', e && e.message)
    }
    if (update.lastDisconnect.error && update.lastDisconnect.error.stack){
      console.log('\n[lastDisconnect] error.stack:')
      console.log(update.lastDisconnect.error.stack)
    }
  }

  if (status === 'open'){
    console.log('Connected!')
    process.exit(0)
  }
})

console.log('Waiting for QR... (keep this terminal open)')
// run quick network/time checks in background
quickChecks().catch(()=>{})
