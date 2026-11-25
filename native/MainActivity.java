package cz.moje.prehravac;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
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
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().getDecorView().setBackgroundColor(Color.parseColor("#0b0b10"));
    View root = findViewById(android.R.id.content);
    // Obsah se odsadí pod stavový řádek a nad navigační lištu (i klávesnici)
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
      v.setPadding(i.left, i.top, i.right, i.bottom);
      return WindowInsetsCompat.CONSUMED;
    });
    WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), root);
    c.setAppearanceLightStatusBars(false); c.setAppearanceLightNavigationBars(false);
  }
}
