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
