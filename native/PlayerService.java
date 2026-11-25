package cz.moje.prehravac;

import android.app.*; import android.content.*; import android.content.pm.ServiceInfo;
import android.os.*;

/** Služba na popředí + upozornění s názvem skladby a dvěma tlačítky. */
public class PlayerService extends Service {
  static PowerManager.WakeLock wl;
  @Override public IBinder onBind(Intent i) { return null; }

  static PendingIntent act(Context c, String a) {
    return PendingIntent.getService(c, a.hashCode(), new Intent(c, PlayerService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }
  static Notification build(Context c, String title, boolean playing) {
    Notification.Builder b;
    if (Build.VERSION.SDK_INT >= 26) {
      c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("player", "Přehrávání hudby", NotificationManager.IMPORTANCE_LOW));
      b = new Notification.Builder(c, "player");
    } else b = new Notification.Builder(c);
    Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    b.setContentTitle(title.isEmpty() ? "Přehrávač" : title).setContentText(playing ? "Přehrává" : "Pozastaveno")
      .setSmallIcon(android.R.drawable.ic_media_play).setOngoing(playing).setOnlyAlertOnce(true)
      .setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE))
      .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pauza" : "Přehrát", act(c, "playpause"))
      .addAction(android.R.drawable.ic_media_next, "Další", act(c, "next"))
      .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(0, 1));
    return b.build();
  }
  /** Drží procesor vzhůru jen při hraní. */
  static void wake(Context c, boolean on) {
    if (on) {
      if (wl == null) wl = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "prehravac:play");
      if (!wl.isHeld()) wl.acquire(4 * 60 * 60 * 1000L);
    } else if (wl != null && wl.isHeld()) wl.release();
  }
  @Override public int onStartCommand(Intent in, int flags, int id) {
    String a = in == null ? null : in.getAction();
    if ("playpause".equals(a) || "next".equals(a)) { PlayerServicePlugin.emit(a); return START_NOT_STICKY; } // klepnutí na tlačítko
    String t = in == null ? null : in.getStringExtra("title");
    boolean playing = in == null || in.getBooleanExtra("playing", true);
    Notification n = build(this, t == null ? "" : t, playing);
    if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    else startForeground(1, n);
    wake(this, playing);
    return START_NOT_STICKY;
  }
  @Override public void onDestroy() { wake(this, false); super.onDestroy(); }
}
