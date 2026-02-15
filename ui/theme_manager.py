import os

# User-provided palettes
LIGHT_THEME = {
    "background": "#f0f0f0",
    "foreground": "#333333",
    "card": "#f5f5f5",
    "card_foreground": "#333333",
    "popover": "#f5f5f5",
    "popover_foreground": "#333333",
    "primary": "#606060",
    "primary_foreground": "#ffffff",
    "secondary": "#e0e0e0",
    "secondary_foreground": "#333333",
    "muted": "#d9d9d9",
    "muted_foreground": "#666666",
    "accent": "#c0c0c0",
    "accent_foreground": "#333333",
    "destructive": "#cc3333",
    "destructive_foreground": "#ffffff",
    "border": "#d0d0d0",
    "input": "#e0e0e0",
    "input_bg": "#ffffff", # Deduced or kept default for contrast
    "ring": "#606060",
    "chart_1": "#606060",
    "chart_2": "#476666",
    "chart_3": "#909090",
    "chart_4": "#a8a8a8",
    "chart_5": "#c0c0c0",
    "radius": "0.35rem",
    "sidebar": "#eaeaea",
    "sidebar_foreground": "#333333",
    "sidebar_primary": "#606060",
    "sidebar_primary_foreground": "#ffffff",
    "sidebar_accent": "#c0c0c0",
    "sidebar_accent_foreground": "#333333",
    "sidebar_border": "#d0d0d0",
    "sidebar_ring": "#606060",
}

DARK_THEME = {
    "background": "#1a1a1a",
    "foreground": "#d9d9d9",
    "card": "#202020",
    "card_foreground": "#d9d9d9",
    "popover": "#202020",
    "popover_foreground": "#d9d9d9",
    "primary": "#a0a0a0",
    "primary_foreground": "#1a1a1a",
    "secondary": "#303030",
    "secondary_foreground": "#d9d9d9",
    "muted": "#2a2a2a",
    "muted_foreground": "#808080",
    "accent": "#404040",
    "accent_foreground": "#d9d9d9",
    "destructive": "#e06666",
    "destructive_foreground": "#ffffff",
    "border": "#353535",
    "input": "#303030",
    "input_bg": "#000000", # Deduced for contrast in dark mode
    "ring": "#a0a0a0",
    "chart_1": "#a0a0a0",
    "chart_2": "#7e9ca0",
    "chart_3": "#707070",
    "chart_4": "#585858",
    "chart_5": "#404040",
    "radius": "0.35rem",
    "sidebar": "#1f1f1f",
    "sidebar_foreground": "#d9d9d9",
    "sidebar_primary": "#a0a0a0",
    "sidebar_primary_foreground": "#1a1a1a",
    "sidebar_accent": "#404040",
    "sidebar_accent_foreground": "#d9d9d9",
    "sidebar_border": "#353535",
    "sidebar_ring": "#a0a0a0",
}

from PyQt6.QtGui import QPalette, QColor

class ThemeManager:
    @staticmethod
    def apply_theme(app, theme_name="dark"):
        """
        Apply the specified theme to the QApplication.
        theme_name: 'light' or 'dark'
        """
        if theme_name == "light":
            palette_config = LIGHT_THEME
        else:
            palette_config = DARK_THEME

        # Apply QPalette to ensure standard window background matches theme (prevents white flash)
        palette = QPalette()
        palette.setColor(QPalette.ColorRole.Window, QColor(palette_config["background"]))
        palette.setColor(QPalette.ColorRole.WindowText, QColor(palette_config["foreground"]))
        palette.setColor(QPalette.ColorRole.Base, QColor(palette_config["input_bg"]))
        palette.setColor(QPalette.ColorRole.AlternateBase, QColor(palette_config["card"]))
        palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(palette_config["popover"]))
        palette.setColor(QPalette.ColorRole.ToolTipText, QColor(palette_config["popover_foreground"]))
        palette.setColor(QPalette.ColorRole.Text, QColor(palette_config["foreground"]))
        palette.setColor(QPalette.ColorRole.Button, QColor(palette_config["card"]))
        palette.setColor(QPalette.ColorRole.ButtonText, QColor(palette_config["card_foreground"]))
        palette.setColor(QPalette.ColorRole.BrightText, QColor(palette_config["destructive_foreground"]))
        palette.setColor(QPalette.ColorRole.Link, QColor(palette_config["primary"]))
        palette.setColor(QPalette.ColorRole.Highlight, QColor(palette_config["primary"]))
        palette.setColor(QPalette.ColorRole.HighlightedText, QColor(palette_config["primary_foreground"]))
        
        app.setPalette(palette)

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
            for key, value in palette_config.items():
                stylesheet = stylesheet.replace(f"{{{{ {key} }}}}", str(value))
                
            app.setStyleSheet(stylesheet)
            return True
        except Exception as e:
            print(f"Error applying theme: {e}")
            return False

    @staticmethod
    def get_palette(theme_name):
        return LIGHT_THEME if theme_name == "light" else DARK_THEME
