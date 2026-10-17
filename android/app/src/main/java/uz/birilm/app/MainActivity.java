package uz.birilm.app;

import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Uch tugmali navigatsiyada Android panel ortiga yarim shaffof parda qo'yadi.
        // Uni o'chiramiz: panel to'liq shaffof, ilova kontenti uning ostida ko'rinadi.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }
}
