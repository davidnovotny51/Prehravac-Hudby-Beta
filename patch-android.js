// Spusťte po "npx cap add android": zkopíruje nativní kód a upraví AndroidManifest.xml
const fs = require('fs'), path = require('path');
const dir = 'android/app/src/main/java/cz/moje/prehravac';
if (!fs.existsSync('android')) { console.error('Nejdřív spusťte: npx cap add android'); process.exit(1); }
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
