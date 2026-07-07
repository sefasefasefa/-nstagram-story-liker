from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.gridlayout import GridLayout
from kivy.uix.textinput import TextInput
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.spinner import Spinner
from kivy.clock import Clock
from kivy.metrics import dp
import threading
from ui.widgets.follower_card import FollowerCard

class MainScreen(Screen):
    def __init__(self, app, **kwargs):
        super().__init__(**kwargs)
        self.app = app
        self.build_ui()

    def build_ui(self):
        layout = BoxLayout(orientation='vertical', spacing=dp(10))
        
        # Header
        header = BoxLayout(size_hint=(1, None), height=dp(50), spacing=dp(5))
        self.username_input = TextInput(
            hint_text="Enter Instagram username",
            size_hint=(0.7, 1),
            multiline=False
        )
        header.add_widget(self.username_input)
        
        fetch_btn = Button(
            text="Get Followers",
            size_hint=(0.3, 1),
            background_normal='',
            background_color=(0.2, 0.6, 1, 1)
        )
        fetch_btn.bind(on_press=self.fetch_followers)
        header.add_widget(fetch_btn)
        layout.add_widget(header)
        
        # Filter controls
        filter_box = BoxLayout(size_hint=(1, None), height=dp(50), spacing=dp(5))
        self.filter_spinner = Spinner(
            text='All Followers',
            values=('All Followers', 'Recommended', 'Male', 'Female', 'Not Following'),
            size_hint=(0.5, 1),
            background_normal='',
            background_color=(0.9, 0.9, 0.9, 1)
        )
        self.filter_spinner.bind(text=self.on_filter_change)
        filter_box.add_widget(self.filter_spinner)
        
        refresh_btn = Button(
            text="Refresh",
            size_hint=(0.2, 1),
            background_normal='',
            background_color=(0.3, 0.7, 0.3, 1)
        )
        refresh_btn.bind(on_press=self.refresh_followers)
        filter_box.add_widget(refresh_btn)
        
        logout_btn = Button(
            text="Logout",
            size_hint=(0.3, 1),
            background_normal='',
            background_color=(0.8, 0.3, 0.3, 1)
        )
        logout_btn.bind(on_press=self.logout)
        filter_box.add_widget(logout_btn)
        
        layout.add_widget(filter_box)
        
        # Content area
        scroll = ScrollView(size_hint=(1, 1))
        self.content_grid = GridLayout(
            cols=1,
            spacing=dp(10),
            size_hint_y=None,
            padding=dp(10)
        )
        self.content_grid.bind(minimum_height=self.content_grid.setter('height'))
        scroll.add_widget(self.content_grid)
        layout.add_widget(scroll)
        
        # Status label
        self.status_label = Label(
            text="",
            size_hint=(1, None),
            height=dp(30),
            color=(0.2, 0.6, 0.2, 1)
        )
        layout.add_widget(self.status_label)
        
        self.add_widget(layout)

    def fetch_followers(self, instance):
        username = self.username_input.text.strip()
        if not username:
            self.app.ui_manager.show_popup("Error", "Please enter a username")
            return
            
        self.status_label.text = "Fetching followers..."
        
        def fetch_thread():
            result = self.app.follower_manager.fetch_followers(username)
            Clock.schedule_once(lambda dt: self.handle_fetch_result(result))
        
        threading.Thread(target=fetch_thread, daemon=True).start()

    def handle_fetch_result(self, result):
        self.status_label.text = ""
        if result.get('success'):
            self.display_followers()
        else:
            self.app.ui_manager.show_popup("Error", result.get('error', 'Unknown error'))

    def on_filter_change(self, spinner, text):
        filter_map = {
            'All Followers': 'all',
            'Recommended': 'recommended',
            'Male': 'male',
            'Female': 'female',
            'Not Following': 'not_following'
        }
        self.app.follower_manager.apply_filter(filter_map[text])
        self.display_followers()

    def refresh_followers(self, instance):
        if not self.app.follower_manager.last_username:
            self.app.ui_manager.show_popup("Error", "No username to refresh")
            return
            
        self.status_label.text = "Refreshing followers..."
        
        def refresh_thread():
            success = self.app.follower_manager.refresh_followers()
            Clock.schedule_once(lambda dt: self.handle_refresh_result(success))
        
        threading.Thread(target=refresh_thread, daemon=True).start()

    def handle_refresh_result(self, success):
        self.status_label.text = ""
        if success:
            self.display_followers()
        else:
            self.app.ui_manager.show_popup("Error", "Failed to refresh followers")

    def display_followers(self):
        self.content_grid.clear_widgets()
        followers = self.app.follower_manager.filtered_followers
        
        if not followers:
            self.content_grid.add_widget(Label(
                text="No followers to display",
                size_hint_y=None,
                height=dp(40),
                color=(0.5, 0.5, 0.5, 1)
            ))
            return
            
        for follower in followers:
            card = FollowerCard(
                follower=follower,
                analyzer=self.app.analyzer,
                size_hint_y=None,
                height=dp(300)
            )
            self.content_grid.add_widget(card)

    def logout(self, instance):
        self.app.auth_manager.logout()
        self.manager.current = 'login'
        self.content_grid.clear_widgets()
        self.username_input.text = ""
        self.filter_spinner.text = 'All Followers'