import { Sticker, StickerTypes } from 'wa-sticker-formatter'
export async function makeSticker(buffer, author='Satoru', pack='Satoru Pack'){
  const st = new Sticker(buffer, { pack, author, type: StickerTypes.FULL, quality: 75 })
  return await st.toBuffer()
}
