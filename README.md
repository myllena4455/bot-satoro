# Satoru Bot (Baileys) — FINAL

## Como rodar
1) `npm install`
2) Substitua a imagem do menu: `assets/menu.jpg`
3) Coloque seus áudios em `assets/voice/` com estes nomes exatos:
   - `(2) Execução de Comandos.mp3`  → toca quando um comando executa com sucesso
   - `(3) Erro de Execução de Comandos.mp3` → toca quando dá erro/anti-flood/comando desconhecido
   - `(4) Tentativa de Execução de Comandos Vips.mp3` → toca quando usuário sem admin tenta comandos de admin
   - `(5) Você é Fraco.mp3` → toca quando perde no RPS ou rankpau < 20%
4) (Opcional) Edite `download.config.json` para TikTok/Pinterest sem marca d’água.
5) `npm start` e escaneie o QR no seu WhatsApp.

## Onde colocar fotos e áudios
- Imagem do menu: `assets/menu.jpg`
- Imagens de reação (opcionais): `assets/reaction1.jpg` ... `reaction6.jpg`
- Áudios de evento: `assets/voice/(2) Execução de Comandos.mp3` etc.

## Observações
- Requer Node 18+ (tem `fetch` nativo) e usa `ffmpeg-static` embutido.
- Este bot usa a sessão do seu número via WhatsApp Web (não oficial). Para produção, prefira Cloud API.
