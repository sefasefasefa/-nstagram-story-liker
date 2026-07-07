# instagram_follower_analyzer/ui/screens/login_screen.py
from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.textinput import TextInput
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.popup import Popup
from kivy.metrics import dp
from kivy.properties import BooleanProperty

class LoginScreen(Screen):
    def __init__(self, auth_manager, ui_manager, app, **kwargs):
        super().__init__(**kwargs)
        self.auth = auth_manager
        self.ui_manager = ui_manager
        self.app = app
        self.build_ui()

    def build_ui(self):
        layout = BoxLayout(orientation='vertical', padding=dp(20), spacing=dp(15))

        self.username_input = TextInput(hint_text="Username", size_hint=(1, None), height=dp(50), multiline=False)
        self.password_input = TextInput(hint_text="Password", password=True, size_hint=(1, None), height=dp(50), multiline=False)
        self.twofa_input = TextInput(hint_text="2FA Code (if needed)", size_hint=(1, None), height=dp(50), multiline=False)
        self.twofa_input.opacity = 0
        self.twofa_input.disabled = True

        login_button = Button(text="Login", size_hint=(1, None), height=dp(50))
        login_button.bind(on_press=self.attempt_login)

        layout.add_widget(Label(text="Login to Instagram", size_hint=(1, None), height=dp(30)))
        layout.add_widget(self.username_input)
        layout.add_widget(self.password_input)
        layout.add_widget(self.twofa_input)
        layout.add_widget(login_button)

        self.add_widget(layout)

    def attempt_login(self, instance):
        username = self.username_input.text.strip()
        password = self.password_input.text.strip()
        twofa_code = self.twofa_input.text.strip() or None

        if not username or not password:
            self.show_error("Error", "Please enter both username and password")
            return

        session_id, error_message = self.auth.pc_auto_login(username, password, twofa_code)

        if session_id:
            self.app.analyzer = self.app.analyzer or self.auth.auto_login.analyzer
            self.app.follower_manager = self.app.follower_manager or self.auth.auto_login.follower_manager
            self.manager.current = 'main'
        else:
            if "2FA required" in error_message or "2FA" in error_message:
                # 2FA gerekiyorsa 2FA inputunu aktif et
                self.show_twofa_input()
                self.show_error("Two-Factor Authentication", "Please enter your 2FA code and try again.")
            else:
                self.show_error("Login Failed", error_message or "Invalid credentials or 2FA code")
    def show_twofa_input(self):
        self.twofa_input.opacity = 1
        self.twofa_input.disabled = False
        self.twofa_input.focus = True

    def show_error(self, title, message):
        content = BoxLayout(orientation='vertical', spacing=dp(10))
        content.add_widget(Label(text=message))

        self.popup = Popup(title=title, content=content, size_hint=(0.8, 0.4))
        self.popup.open()
         
