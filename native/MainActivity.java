package cz.moje.prehravac;

import android.content.Intent;
import android.graphics.Color;
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
  @Override public void onCreate(Bundle b) {
    registerPlugin(PlayerServicePlugin.class);
    super.onCreate(b);
    int dark = Color.parseColor("#0b0b10");
    // Tmavé systémové lišty a odsazení obsahu pod stavový řádek a nad navigační lištu
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(dark);
    getWindow().setNavigationBarColor(dark);
    getWindow().getDecorView().setBackgroundColor(dark);
    View root = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
      v.setPadding(i.left, i.top, i.right, i.bottom);
      return WindowInsetsCompat.CONSUMED;
    });
    WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), root);
    c.setAppearanceLightStatusBars(false); c.setAppearanceLightNavigationBars(false);

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
