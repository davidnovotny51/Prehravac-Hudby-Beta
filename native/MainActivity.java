package cz.moje.prehravac;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  // Okraje systémových lišt v CSS pixelech, čte je JavaScript přes plugin
  static volatile float it, ir, ib, il;

  @Override public void onCreate(Bundle savedState) {
    registerPlugin(PlayerServicePlugin.class);
    super.onCreate(savedState);
    int dark = Color.parseColor("#0b0b10");

    // Aplikace se kreslí pod průhledné systémové lišty, takže mají barvu pozadí aplikace
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
    getWindow().getDecorView().setBackgroundColor(dark);

    View root = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
      boolean keyboard = ime.bottom > bars.bottom;
      view.setPadding(0, 0, 0, keyboard ? ime.bottom : 0);      // klávesnice zmenší okno
      float density = getResources().getDisplayMetrics().density;
      it = bars.top / density; ir = bars.right / density; il = bars.left / density;
      ib = keyboard ? 0 : bars.bottom / density;
      WebView page = getBridge() != null ? getBridge().getWebView() : null;
      if (page != null) page.post(() -> page.evaluateJavascript("window.__applyInsets&&window.__applyInsets()", null));
      return WindowInsetsCompat.CONSUMED;
    });
    WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), root);
    controller.setAppearanceLightStatusBars(false);             // světlé ikony na tmavém pozadí
    controller.setAppearanceLightNavigationBars(false);

    WebView wv = getBridge().getWebView();
    wv.setBackgroundColor(dark);
    wv.getSettings().setMediaPlaybackRequiresUserGesture(false); // další skladba bez klepnutí
    // Tlačítko Zpět aplikaci jen skryje, hudba hraje dál
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() { moveTaskToBack(true); }
    });
  }

  @Override public void onPause() {
    super.onPause();
    if (getBridge() != null && getBridge().getWebView() != null) { // webové zobrazení nesmí na pozadí usnout
      getBridge().getWebView().onResume(); getBridge().getWebView().resumeTimers();
    }
  }

  @Override public void onDestroy() {
    if (isFinishing()) stopService(new Intent(this, PlayerService.class)); // smazání z posledních ukončí i upozornění
    super.onDestroy();
  }
}
