import os

# User-provided palettes
LIGHT_THEME = {
    "background": "#f7f9f3",
    "foreground": "#000000",
    "card": "#ffffff",
    "card_foreground": "#000000",
    "popover": "#ffffff",
    "popover_foreground": "#000000",
    "primary": "#4f46e5",
    "primary_foreground": "#ffffff",
    "secondary": "#14b8a6",
    "secondary_foreground": "#ffffff",
    "muted": "#f0f0f0",
    "muted_foreground": "#333333",
    "accent": "#f59e0b",
    "accent_foreground": "#000000",
    "destructive": "#ef4444",
    "destructive_foreground": "#ffffff",
    "border": "#000000",
    "input": "#737373", 
    "input_bg": "#ffffff", 
    "ring": "#a5b4fc",
    "chart_1": "#4f46e5",
    "chart_2": "#14b8a6",
    "chart_3": "#f59e0b",
    "chart_4": "#ec4899",
    "chart_5": "#22c55e",
    "radius": "1rem",
    "sidebar": "#f7f9f3",
    "sidebar_foreground": "#000000",
    "sidebar_primary": "#4f46e5",
    "sidebar_primary_foreground": "#ffffff",
    "sidebar_accent": "#f59e0b",
    "sidebar_accent_foreground": "#000000",
    "sidebar_border": "#000000",
    "sidebar_ring": "#a5b4fc",
}

DARK_THEME = {
    "background": "#000000",
    "foreground": "#ffffff",
    "card": "#1a212b",
    "card_foreground": "#ffffff",
    "popover": "#1a212b",
    "popover_foreground": "#ffffff",
    "primary": "#818cf8",
    "primary_foreground": "#000000",
    "secondary": "#2dd4bf",
    "secondary_foreground": "#000000",
    "muted": "#333333",
    "muted_foreground": "#cccccc",
    "accent": "#fcd34d",
    "accent_foreground": "#000000",
    "destructive": "#f87171",
    "destructive_foreground": "#000000",
    "border": "#545454",
    "input": "#ffffff",
    "input_bg": "#18181b",
    "ring": "#818cf8",
    "chart_1": "#818cf8",
    "chart_2": "#2dd4bf",
    "chart_3": "#fcd34d",
    "chart_4": "#f472b6",
    "chart_5": "#4ade80",
    "radius": "1rem",
    "sidebar": "#000000",
    "sidebar_foreground": "#ffffff",
    "sidebar_primary": "#818cf8",
    "sidebar_primary_foreground": "#000000",
    "sidebar_accent": "#fcd34d",
    "sidebar_accent_foreground": "#000000",
    "sidebar_border": "#ffffff",
    "sidebar_ring": "#818cf8",
}

class ThemeManager:
    @staticmethod
    def apply_theme(app, theme_name="dark"):
        """
        Apply the specified theme to the QApplication.
        theme_name: 'light' or 'dark'
        """
        if theme_name == "light":
            palette = LIGHT_THEME
        else:
            palette = DARK_THEME

        # Load styles.qss
        try:
            # Determine path to styles.qss
            import sys
            if getattr(sys, 'frozen', False):
                app_dir = os.path.dirname(sys.executable)
                candidates = [
                    os.path.join(app_dir, "styles.qss"),
                    os.path.join(app_dir, "_internal", "styles.qss")
                ]
            else:
                app_dir = os.path.dirname(os.path.abspath(__file__)).replace(os.sep + 'ui', '')
                candidates = [os.path.join(app_dir, "styles.qss")]

            stylesheet = ""
            for path in candidates:
                if os.path.exists(path):
                    with open(path, "r") as f:
                        stylesheet = f.read()
                    break
            
            if not stylesheet:
                print("Error: styles.qss not found")
                return False
                
            # Perform replacement
            for key, value in palette.items():
                stylesheet = stylesheet.replace(f"{{{{ {key} }}}}", str(value))
                
            app.setStyleSheet(stylesheet)
            return True
        except Exception as e:
            print(f"Error applying theme: {e}")
            return False

    @staticmethod
    def get_palette(theme_name):
        return LIGHT_THEME if theme_name == "light" else DARK_THEME
