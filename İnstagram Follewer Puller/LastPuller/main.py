from kivy.app import App
from kivy.uix.screenmanager import ScreenManager
from kivy.core.window import Window
from kivy.config import Config
from api.auth_manager import AuthManager
from core.analyzer import InstagramFollowerAnalyzer
from core.follower_manager import FollowerManager
from ui.ui_manager import UIManager
from ui.screens.login_screen import LoginScreen
from ui.screens.main_screen import MainScreen
import threading
from kivy.clock import Clock

Config.set('input', 'mouse', 'mouse,disable_multitouch')

class InstagramApp(App):
    def build(self):
        self.title = "Instagram Follower Analyzer"
        Window.size = (900, 700)
        
        # Initialize managers
        self.auth_manager = AuthManager()
        self.ui_manager = UIManager()
        self.analyzer = None
        self.follower_manager = None
        
        # Setup screens
        self.screen_manager = ScreenManager()
        self.screen_manager.add_widget(
            LoginScreen(
                name='login',
                auth_manager=self.auth_manager,
                ui_manager=self.ui_manager,
                app=self
            )
        )
        self.screen_manager.add_widget(
            MainScreen(
                name='main',
                app=self
            )
        )
        return self.screen_manager

    def on_start(self):
        """Check for existing session on app start"""
        if self.auth_manager.current_session:
            self.initialize_managers(self.auth_manager.current_session)
            self.screen_manager.current = 'main'

    def initialize_managers(self, session_id):
        """Initialize analyzer and follower manager"""
        self.analyzer = InstagramFollowerAnalyzer(session_id=session_id)
        self.follower_manager = FollowerManager(self.analyzer)

    def on_stop(self):
        """Cleanup when app closes"""
        if hasattr(self, 'auth_manager'):
            self.auth_manager.logout()

if __name__ == '__main__':
    InstagramApp().run()