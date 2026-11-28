// Spusťte po "npx cap add android": zkopíruje nativní kód a upraví AndroidManifest.xml
const fs = require('fs'), path = require('path');
const dir = 'android/app/src/main/java/cz/moje/prehravac';
if (!fs.existsSync('android')) { console.error('Nejdřív spusťte: npx cap add android'); process.exit(1); }
// Ikona aplikace: assets/icon-only.png; když jste změnili jen www/icons/icon-512.png, použije se ta
const crypto = require('crypto');
const sha = f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : '';
const PLACEHOLDER = '645dbf07759e82da5de1278b490f9d44ea29963682a4b130b6e36ac99f4832a4';
if (fs.existsSync('www/icons/icon-512.png') && sha('www/icons/icon-512.png') !== PLACEHOLDER &&
    (!fs.existsSync('assets/icon-only.png') || sha('assets/icon-only.png') === PLACEHOLDER)) {
  fs.mkdirSync('assets', { recursive: true });
  fs.copyFileSync('www/icons/icon-512.png', 'assets/icon-only.png');
  console.log('Ikona aplikace: použita www/icons/icon-512.png');
}
// Jednobarevná nota do stavového řádku (barvu doplní systém)
const dr = 'android/app/src/main/res/drawable';
fs.mkdirSync(dr, { recursive: true });
fs.writeFileSync(path.join(dr, 'ic_stat_player.xml'), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M12,3v10.55c-0.59,-0.34 -1.27,-0.55 -2,-0.55 -2.21,0 -4,1.79 -4,4s1.79,4 4,4 4,-1.79 4,-4V7h4V3h-6z"/></vector>');
fs.mkdirSync(dir, { recursive: true });
for (const f of ['PlayerService.java', 'PlayerServicePlugin.java', 'MainActivity.java']) fs.copyFileSync(path.join('native', f), path.join(dir, f));
const mf = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('PlayerService')) {
  const perms = ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'POST_NOTIFICATIONS', 'WAKE_LOCK']
    .map(p => `    <uses-permission android:name="android.permission.${p}" />\n`).join('');
  m = m.replace('<application', perms + '    <application');
  m = m.replace('</application>', '    <service android:name=".PlayerService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>');
  fs.writeFileSync(mf, m);
}
console.log('Hotovo. Teď spusťte: npx cap sync');

// ===== Ikona aplikace =====
// Šablona Capacitoru obsahuje vlastní výchozí ikonu a nástroj capacitor-assets ji z jednoho souboru nepřepíše,
// proto se ikona vytvoří zde přímo ze souboru assets/icon-only.png (spouští se před i po capacitor-assets).
async function makeIcons() {
  let sharp;
  try { sharp = require('sharp'); } catch (e) { console.log('Ikony: knihovna sharp není dostupná, ikony zůstanou podle capacitor-assets.'); return; }
  if (!fs.existsSync('assets/icon-only.png')) { console.log('Ikony: chybí assets/icon-only.png'); return; }
  const src = fs.readFileSync('assets/icon-only.png');
  const res = 'android/app/src/main/res';
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };   // velikost běžné ikony v pixelech
  for (const [density, s] of Object.entries(sizes)) {
    const dir = path.join(res, 'mipmap-' + density);
    fs.mkdirSync(dir, { recursive: true });
    const layer = Math.round(s * 108 / 48), inner = Math.round(s * 72 / 48);     // adaptivní ikona: vrstva 108 dp, viditelná část 72 dp
    await sharp(src).resize(s, s, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
    const mask = Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`);
    await sharp(src).resize(s, s, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    const fg = await sharp(src).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
    await sharp({ create: { width: layer, height: layer, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: fg, gravity: 'centre' }]).png().toFile(path.join(dir, 'ic_player_foreground.png'));
  }
  // Barva pozadí adaptivní ikony = průměrná barva ikony
  const px = await sharp(src).resize(1, 1, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  const hex = '#' + [...px.slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('');
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values/ic_launcher_bg_player.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_bg_player">${hex}</color>\n</resources>\n`);
  const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_bg_player"/>\n  <foreground android:drawable="@mipmap/ic_player_foreground"/>\n</adaptive-icon>\n';
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  for (const n of ['ic_launcher.xml', 'ic_launcher_round.xml']) fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', n), adaptive);
  console.log('Ikony aplikace vytvořeny z assets/icon-only.png (pozadí ' + hex + ')');
}
makeIcons().catch(e => console.log('Ikony se nepodařilo vytvořit: ' + e.message));
