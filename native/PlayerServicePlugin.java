package cz.moje.prehravac;

import android.Manifest; import android.app.NotificationManager; import android.content.Intent; import android.content.pm.PackageManager; import android.os.Build;
import androidx.core.app.ActivityCompat; import androidx.core.content.ContextCompat;
import com.getcapacitor.*; import com.getcapacitor.annotation.CapacitorPlugin;

/** Most mezi JavaScriptem a službou: spuštění, aktualizace upozornění, události z tlačítek. */
@CapacitorPlugin(name = "PlayerService")
public class PlayerServicePlugin extends Plugin {
  static PlayerServicePlugin inst;
  @Override public void load() { inst = this; }
  static void emit(String a) {
    if (inst == null) return;
    JSObject o = new JSObject(); o.put("action", a); inst.notifyListeners("action", o);
  }
  @PluginMethod public void start(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
      ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
    Intent i = new Intent(getContext(), PlayerService.class);
    Boolean pl = call.getBoolean("playing", true);
    i.putExtra("title", call.getString("title", "")); i.putExtra("playing", pl == null || pl);
    ContextCompat.startForegroundService(getContext(), i);
    call.resolve();
  }
  @PluginMethod public void update(PluginCall call) {
    Boolean p = call.getBoolean("playing", true); boolean playing = p == null || p;
    getContext().getSystemService(NotificationManager.class).notify(1, PlayerService.build(getContext(), call.getString("title", ""), playing));
    PlayerService.wake(getContext(), playing);
    call.resolve();
  }
  @PluginMethod public void stop(PluginCall call) {
    getContext().stopService(new Intent(getContext(), PlayerService.class)); call.resolve();
  }
}
