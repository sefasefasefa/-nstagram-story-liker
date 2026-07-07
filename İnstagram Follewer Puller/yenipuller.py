import requests
import re
import json
from typing import Dict, List, Optional, Tuple
import gender_guesser.detector as gender_detector
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.button import Button
from kivy.uix.image import AsyncImage
from kivy.uix.label import Label
from kivy.uix.scrollview import ScrollView
from kivy.uix.textinput import TextInput
from kivy.uix.spinner import Spinner
from kivy.uix.popup import Popup
from kivy.core.window import Window
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.clock import Clock
from kivy.utils import platform
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
import webbrowser
from kivy.config import Config
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import threading
from functools import partial
from kivy.metrics import dp

# Platform check
IS_ANDROID = platform == 'android'
if IS_ANDROID:
    from jnius import autoclass, cast
    from android.runnable import run_on_ui_thread
    from android.permissions import request_permissions, Permission
    PythonActivity = autoclass('org.kivy.android.PythonActivity')
    WebView = autoclass('android.webkit.WebView')
    WebViewClient = autoclass('android.webkit.WebViewClient')
    CookieManager = autoclass('android.webkit.CookieManager')
    LayoutParams = autoclass('android.view.ViewGroup$LayoutParams')
    View = autoclass('android.view.View')
    Color = autoclass('android.graphics.Color')
    request_permissions([Permission.INTERNET])

# Disable multi-touch emulation
Config.set('input', 'mouse', 'mouse,disable_multitouch')

class InstagramAPI:
    BASE_URL = "https://www.instagram.com"
    API_URL = BASE_URL + "/api/v1/"
    
    @staticmethod
    def get_headers(csrf_token=None):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': InstagramAPI.BASE_URL + '/',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        if csrf_token:
            headers['X-CSRFToken'] = csrf_token
        return headers
    
    @staticmethod
    def get_web_profile_info(username):
        return f"{InstagramAPI.BASE_URL}/api/v1/users/web_profile_info/?username={username}"
    
    @staticmethod
    def get_followers_url(user_id):
        return f"{InstagramAPI.API_URL}friendships/{user_id}/followers/"
    
    @staticmethod
    def get_follow_url(user_id):
        return f"{InstagramAPI.API_URL}friendships/create/{user_id}/"
    
    @staticmethod
    def get_unfollow_url(user_id):
        return f"{InstagramAPI.API_URL}friendships/destroy/{user_id}/"
    
    @staticmethod
    def get_login_url():
        return f"{InstagramAPI.BASE_URL}/accounts/login/ajax/"

class InstagramAutoLogin:
    def __init__(self):
        self.driver = None
        
    def get_session_id(self, username, password):
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            self.driver = webdriver.Chrome(options=chrome_options)
            
            # Anti-bot measures
            self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            self.driver.get("https://www.instagram.com/accounts/login/")
            time.sleep(2)
            
            # Login process
            username_field = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.NAME, "username")))
            password_field = self.driver.find_element(By.NAME, "password")
            
            username_field.clear()
            for char in username:
                username_field.send_keys(char)
                time.sleep(0.15)
                
            password_field.clear()
            for char in password:
                password_field.send_keys(char)
                time.sleep(0.15)
            
            login_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']")))
            self.driver.execute_script("arguments[0].click();", login_button)
            
            WebDriverWait(self.driver, 10).until(
                lambda d: "accounts/login" not in d.current_url)
            time.sleep(3)
            
            # Get cookies
            self.driver.get("https://www.instagram.com")
            cookies = self.driver.get_cookies()
            for cookie in cookies:
                if cookie['name'] == 'sessionid':
                    return cookie['value']
                    
            raise Exception("Session ID cookie not found")
            
        except Exception as e:
            print(f"[LOGIN ERROR] {str(e)}")
            return None
        finally:
            if self.driver:
                self.driver.quit()

class InstagramLoginHandler:
    @staticmethod
    def extract_session_id(cookie_str):
        match = re.search(r'sessionid=([^;]+)', cookie_str)
        return match.group(1) if match else None

class InstagramFollowerAnalyzer:
    def __init__(self, session_id: str = None, cookies: Dict = None):
        self.gender_detector = gender_detector.Detector()
        self.ai_model = AIModel()
        
        self.session = requests.Session()
        if session_id:
            self._init_with_session_id(session_id)
        elif cookies:
            self._init_with_cookies(cookies)
        
        self.csrf_token = self._get_csrf_token()

    def _init_with_session_id(self, session_id: str):
        session_parts = session_id.split('%3A')
        if len(session_parts) < 3:
            raise ValueError("Invalid session_id format. Expected: 'userid%3Asessionid%3Amore'")
            
        self.user_id = session_parts[0]
        self.session_token = session_id
        
        self.session.cookies.update({
            'sessionid': self.session_token,
            'ds_user_id': self.user_id
        })

    def _init_with_cookies(self, cookies: Dict):
        self.session.cookies.update(cookies)
        self.user_id = cookies.get('ds_user_id', '')
        self.session_token = cookies.get('sessionid', '')

    def _get_csrf_token(self) -> Optional[str]:
        try:
            response = self.session.get(InstagramAPI.BASE_URL, headers=InstagramAPI.get_headers())
            return self.session.cookies.get('csrftoken')
        except Exception as e:
            print(f"Error getting CSRF token: {e}")
            return None

    def verify_session(self) -> bool:
        try:
            response = self.session.get(
                f"{InstagramAPI.BASE_URL}/api/v1/accounts/edit/web_form_data/",
                headers=InstagramAPI.get_headers(self.csrf_token)
            )
            return response.status_code == 200
        except Exception:
            return False

    def get_user_id(self, username: str) -> Optional[str]:
        try:
            response = self.session.get(
                InstagramAPI.get_web_profile_info(username),
                headers={
                    **InstagramAPI.get_headers(self.csrf_token),
                    'Referer': f'{InstagramAPI.BASE_URL}/{username}/'
                }
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('data', {}).get('user', {}).get('id')
            return None
        except Exception as e:
            print(f"Error getting user ID: {e}")
            return None

    def get_followers(self, user_id: str, count: int = 200) -> Dict:
        try:
            params = {
                'count': count,
                'search_surface': 'follow_list_page'
            }
            response = self.session.get(
                InstagramAPI.get_followers_url(user_id),
                headers=InstagramAPI.get_headers(self.csrf_token),
                params=params
            )
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'data': response.json()
                }
            return {
                'success': False,
                'error': f"Status code: {response.status_code}"
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def get_followers_with_details(self, username: str) -> Dict:
        try:
            user_id = self.get_user_id(username)
            if not user_id:
                return {
                    'success': False,
                    'error': 'Could not get user ID'
                }
            
            followers_data = self.get_followers(user_id)
            if not followers_data['success']:
                return followers_data
            
            followers = []
            for user in followers_data['data']['users']:
                first_name = user.get('full_name', '').split()[0] if user.get('full_name') else ''
                gender = self.gender_detector.get_gender(first_name) if first_name else 'unknown'
                
                followers.append({
                    'user_id': user.get('pk'),
                    'username': user.get('username'),
                    'full_name': user.get('full_name'),
                    'profile_pic_url': user.get('profile_pic_url'),
                    'follower_count': user.get('follower_count'),
                    'following_count': user.get('following_count'),
                    'bio': user.get('biography'),
                    'gender': gender,
                    'followed_by_viewer': user.get('followed_by_viewer', False),
                    'requested_by_viewer': user.get('requested_by_viewer', False)
                })
            
            return {
                'success': True,
                'data': followers
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def follow_user(self, target_user_id: str) -> Tuple[bool, str]:
        try:
            response = self.session.post(
                InstagramAPI.get_follow_url(target_user_id),
                headers=InstagramAPI.get_headers(self.csrf_token)
            )
            return (response.status_code == 200, 
                   "Success" if response.status_code == 200 else f"Status: {response.status_code}")
        except Exception as e:
            return False, f"Error: {str(e)}"

    def unfollow_user(self, target_user_id: str) -> Tuple[bool, str]:
        try:
            response = self.session.post(
                InstagramAPI.get_unfollow_url(target_user_id),
                headers=InstagramAPI.get_headers(self.csrf_token)
            )
            return (response.status_code == 200, 
                   "Success" if response.status_code == 200 else f"Status: {response.status_code}")
        except Exception as e:
            return False, f"Error: {str(e)}"

    def get_ai_recommendations(self, followers: List[Dict]) -> List[Dict]:
        return self.ai_model.get_recommendations(followers)

class AIModel:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=100)
        self.model = KMeans(n_clusters=5, random_state=42)

    def get_recommendations(self, followers: List[Dict]) -> List[Dict]:
        if not followers:
            return []

        texts = [f"{f.get('full_name', '')} {f.get('username', '')} {f.get('bio', '')}" 
                for f in followers]
        
        X = self.vectorizer.fit_transform(texts)
        clusters = self.model.fit_predict(X)
        cluster_counts = np.bincount(clusters)
        main_cluster = np.argmax(cluster_counts)
        
        recommendations = []
        for i, user in enumerate(followers):
            if clusters[i] != main_cluster:
                user['recommendation_score'] = float(cluster_counts[clusters[i]] / len(followers))
                recommendations.append(user)
        
        recommendations.sort(key=lambda x: x['recommendation_score'], reverse=True)
        return recommendations[:10]

class FollowerCard(BoxLayout):
    def __init__(self, follower: Dict, analyzer: InstagramFollowerAnalyzer, **kwargs):
        super().__init__(**kwargs)
        self.orientation = 'vertical'
        self.size_hint_y = None
        self.height = dp(300) if IS_ANDROID else 300
        self.padding = dp(5)
        self.spacing = dp(5)
        self.follower = follower
        self.analyzer = analyzer
        
        # Profile image
        self.image = AsyncImage(
            source=follower.get('profile_pic_url', ''),
            size_hint=(1, 0.7),
            allow_stretch=True,
            keep_ratio=True
        )
        self.add_widget(self.image)
        
        # User info
        info_layout = BoxLayout(orientation='vertical', size_hint=(1, 0.3))
        
        self.name_label = Label(
            text=f"{follower.get('full_name', '')} (@{follower.get('username', '')})",
            size_hint=(1, 0.4),
            halign='center',
            text_size=(self.width, None),
            shorten=True,
            shorten_from='right'
        )
        info_layout.add_widget(self.name_label)
        
        stats_label = Label(
            text=f"Followers: {follower.get('follower_count', 'N/A')} | Following: {follower.get('following_count', 'N/A')}",
            size_hint=(1, 0.3),
            halign='center',
            text_size=(self.width, None)
        )
        info_layout.add_widget(stats_label)
        
        gender_label = Label(
            text=f"Gender: {follower.get('gender', 'unknown').title()}",
            size_hint=(1, 0.3),
            halign='center',
            text_size=(self.width, None)
        )
        info_layout.add_widget(gender_label)
        
        self.add_widget(info_layout)
        
        # Follow button
        self.follow_btn = Button(
            text=self._get_follow_button_text(),
            size_hint=(1, 0.2),
            on_press=self._toggle_follow,
            background_normal='',
            background_color=(0.2, 0.6, 1, 1) if not self.follower.get('followed_by_viewer', False) else (0.8, 0.8, 0.8, 1)
        )
        self.add_widget(self.follow_btn)
    
    def _get_follow_button_text(self) -> str:
        if self.follower.get('followed_by_viewer', False):
            return "Following"
        elif self.follower.get('requested_by_viewer', False):
            return "Requested"
        return "Follow"
    
    def _toggle_follow(self, instance):
        if self.follower.get('followed_by_viewer', False):
            success, message = self.analyzer.unfollow_user(self.follower['user_id'])
        else:
            success, message = self.analyzer.follow_user(self.follower['user_id'])
        
        popup = Popup(
            title='Result',
            content=Label(text=message),
            size_hint=(0.8, 0.3)
        )
        popup.open()
        
        if success:
            self.follower['followed_by_viewer'] = not self.follower.get('followed_by_viewer', False)
            instance.text = self._get_follow_button_text()
            instance.background_color = (0.8, 0.8, 0.8, 1) if self.follower['followed_by_viewer'] else (0.2, 0.6, 1, 1)

class LoginScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.name = 'login'
        self.auto_login = InstagramAutoLogin()
        
        layout = BoxLayout(orientation='vertical', padding=dp(20), spacing=dp(15))
        
        title = Label(
            text="Instagram Follower Analyzer", 
            font_size=dp(24), 
            size_hint=(1, 0.2),
            bold=True
        )
        layout.add_widget(title)
        
        # PC Auto Login Section
        pc_auto_layout = BoxLayout(orientation='vertical', size_hint=(1, 0.3), spacing=dp(10))
        
        self.pc_username = TextInput(
            hint_text="Instagram Username", 
            size_hint=(1, 0.5),
            multiline=False
        )
        pc_auto_layout.add_widget(self.pc_username)
        
        self.pc_password = TextInput(
            hint_text="Instagram Password", 
            password=True, 
            size_hint=(1, 0.5),
            multiline=False
        )
        pc_auto_layout.add_widget(self.pc_password)
        
        pc_auto_btn = Button(
            text="PC Auto Login", 
            size_hint=(1, 0.5),
            background_normal='',
            background_color=(0.2, 0.6, 1, 1)
        )
        pc_auto_btn.bind(on_press=self.start_pc_auto_login)
        pc_auto_layout.add_widget(pc_auto_btn)
        
        layout.add_widget(pc_auto_layout)
        
        # OR separator
        or_label = Label(
            text="───────── OR ─────────", 
            size_hint=(1, 0.1),
            color=(0.5, 0.5, 0.5, 1)
        )
        layout.add_widget(or_label)
        
        # Android WebView Login
        if IS_ANDROID:
            android_btn = Button(
                text="Android Auto Login", 
                size_hint=(1, 0.2),
                background_normal='',
                background_color=(0.3, 0.7, 0.3, 1)
            )
            android_btn.bind(on_press=self.android_auto_login)
            layout.add_widget(android_btn)
        
        # Browser Login
        browser_btn = Button(
            text="Open in Browser", 
            size_hint=(1, 0.2),
            background_normal='',
            background_color=(0.8, 0.4, 0.4, 1)
        )
        browser_btn.bind(on_press=self.open_browser)
        layout.add_widget(browser_btn)
        
        # Manual Session ID Login
        session_layout = BoxLayout(orientation='vertical', size_hint=(1, 0.3), spacing=dp(10))
        
        self.session_input = TextInput(
            hint_text="Paste Session ID (userid%3Asessionid%3Amore)",
            size_hint=(1, 0.5),
            multiline=False,
            password=True
        )
        session_layout.add_widget(self.session_input)
        
        session_btn = Button(
            text="Login with Session ID", 
            size_hint=(1, 0.5),
            background_normal='',
            background_color=(0.5, 0.3, 0.7, 1)
        )
        session_btn.bind(on_press=self.try_session_login)
        session_layout.add_widget(session_btn)
        
        layout.add_widget(session_layout)
        
        self.status_label = Label(
            text="", 
            size_hint=(1, 0.1),
            color=(0.7, 0.2, 0.2, 1)
        )
        layout.add_widget(self.status_label)
        
        self.add_widget(layout)
    
    def start_pc_auto_login(self, instance):
        """Start PC auto login in a thread"""
        username = self.pc_username.text.strip()
        password = self.pc_password.text.strip()
        
        if not username or not password:
            self.show_error("Error", "Username and password required")
            return
            
        self.set_status("Starting PC auto login...")
        threading.Thread(target=self.pc_auto_login, args=(username, password)).start()
    
    def pc_auto_login(self, username, password):
        """Perform PC auto login"""
        session_id = self.auto_login.get_session_id(username, password)
        
        if session_id:
            Clock.schedule_once(partial(self.login_success, session_id))
        else:
            Clock.schedule_once(lambda dt: self.show_error("Error", "Auto login failed"))
    
    @run_on_ui_thread if IS_ANDROID else lambda f: f
    def android_auto_login(self, instance):
        """Android WebView auto login"""
        try:
            activity = PythonActivity.mActivity
            
            # Create a container layout for WebView
            container = BoxLayout(orientation='vertical')
            
            # Add a close button at the top
            close_btn = Button(
                text="Close WebView",
                size_hint=(1, 0.1),
                background_normal='',
                background_color=(0.8, 0.2, 0.2, 1)
            )
            
            # Create WebView
            self.webview = WebView(activity)
            settings = self.webview.getSettings()
            settings.setJavaScriptEnabled(True)
            settings.setDomStorageEnabled(True)
            
            # Set a custom WebViewClient to handle page loads
            class CustomWebViewClient(WebViewClient):
                def __init__(self, callback):
                    super().__init__()
                    self.callback = callback
                
                def onPageFinished(self, view, url):
                    self.callback(url)
            
            self.webview.setWebViewClient(CustomWebViewClient(self.check_android_cookies))
            
            # Add widgets to container
            container.add_widget(close_btn)
            container.add_widget(self.webview)
            
            # Create a popup to hold the container
            self.webview_popup = Popup(
                title="Instagram Login",
                content=container,
                size_hint=(1, 1),
                auto_dismiss=False
            )
            
            # Bind close button
            close_btn.bind(on_press=lambda x: self.webview_popup.dismiss())
            
            # Load login page
            self.webview.loadUrl("https://www.instagram.com/accounts/login/")
            
            # Show popup
            self.webview_popup.open()
            self.set_status("Please login in the WebView...")
            
        except Exception as e:
            self.show_error("Android Error", str(e))
    
    def check_android_cookies(self, url):
        """Check Android WebView cookies when page loads"""
        try:
            if "instagram.com" in url:
                cookies = CookieManager.getInstance().getCookie("https://instagram.com")
                if cookies and "sessionid" in cookies:
                    session_id = InstagramLoginHandler.extract_session_id(cookies)
                    if session_id:
                        Clock.schedule_once(partial(self.handle_android_login, session_id))
        except Exception as e:
            print(f"Cookie check error: {e}")

    def handle_android_login(self, session_id, *args):
        """Handle successful Android login"""
        if hasattr(self, 'webview_popup'):
            self.webview_popup.dismiss()
        
        self.manager.analyzer = InstagramFollowerAnalyzer(session_id=session_id)
        if self.manager.analyzer.verify_session():
            self.manager.current = 'main'
        else:
            self.show_error("Error", "Session verification failed")
    
    def open_browser(self, instance):
        """Open browser for manual login"""
        webbrowser.open("https://www.instagram.com/accounts/login/")
        self.set_status("Please login in browser and paste session ID")
    
    def try_session_login(self, instance):
        """Manual session ID login"""
        session_id = self.session_input.text.strip()
        if not session_id:
            self.show_error("Error", "Please enter session ID")
            return
        
        try:
            self.manager.analyzer = InstagramFollowerAnalyzer(session_id=session_id)
            if self.manager.analyzer.verify_session():
                self.manager.current = 'main'
            else:
                self.show_error("Error", "Invalid session ID")
        except Exception as e:
            self.show_error("Error", str(e))
    
    def login_success(self, session_id, *args):
        """Handle successful login"""
        self.manager.analyzer = InstagramFollowerAnalyzer(session_id=session_id)
        if self.manager.analyzer.verify_session():
            self.manager.current = 'main'
        else:
            self.show_error("Error", "Session verification failed")
    
    def set_status(self, message):
        """Update status label"""
        self.status_label.text = message
    
    def show_error(self, title, message):
        """Show error popup"""
        Popup(
            title=title,
            content=Label(text=message),
            size_hint=(0.8, 0.3)
        ).open()

class MainScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.name = 'main'
        self.followers = []
        self.filtered_followers = []
        self.current_view = "all"
        
        self.main_layout = BoxLayout(orientation='vertical', spacing=dp(10))
        
        # Header
        header = BoxLayout(size_hint=(1, None), height=dp(50), spacing=dp(5))
        self.username_input = TextInput(
            hint_text="Enter Instagram username", 
            size_hint=(0.6, 1),
            multiline=False
        )
        header.add_widget(self.username_input)
        
        fetch_btn = Button(
            text="Get Followers", 
            size_hint=(0.2, 1),
            background_normal='',
            background_color=(0.2, 0.6, 1, 1)
        )
        fetch_btn.bind(on_press=self.fetch_followers)
        header.add_widget(fetch_btn)
        
        logout_btn = Button(
            text="Logout", 
            size_hint=(0.2, 1),
            background_normal='',
            background_color=(0.8, 0.3, 0.3, 1)
        )
        logout_btn.bind(on_press=self.logout)
        header.add_widget(logout_btn)
        
        self.main_layout.add_widget(header)
        
        # Filter controls
        filter_controls = BoxLayout(size_hint=(1, None), height=dp(50), spacing=dp(5))
        
        self.view_spinner = Spinner(
            text='All Followers',
            values=('All Followers', 'AI Recommendations', 'Male', 'Female', 'Unknown Gender'),
            size_hint=(0.4, 1),
            background_normal='',
            background_color=(0.9, 0.9, 0.9, 1)
        )
        self.view_spinner.bind(text=self.change_view)
        filter_controls.add_widget(self.view_spinner)
        
        self.main_layout.add_widget(filter_controls)
        
        # Content area
        self.scroll = ScrollView(size_hint=(1, 1))
        self.content_grid = GridLayout(
            cols=2 if not IS_ANDROID else 1,
            spacing=dp(10),
            size_hint_y=None,
            padding=dp(10)
        )
        self.content_grid.bind(minimum_height=self.content_grid.setter('height'))
        self.scroll.add_widget(self.content_grid)
        self.main_layout.add_widget(self.scroll)
        
        self.add_widget(self.main_layout)
    
    def fetch_followers(self, instance):
        username = self.username_input.text.strip()
        if not username:
            self.show_popup("Error", "Please enter a username")
            return
            
        loading_popup = Popup(
            title="Loading",
            content=Label(text="Fetching followers..."),
            size_hint=(0.6, 0.3)
        )
        loading_popup.open()
        
        def fetch_thread():
            result = self.manager.analyzer.get_followers_with_details(username)
            Clock.schedule_once(lambda dt: self.handle_fetch_result(result, loading_popup))
        
        threading.Thread(target=fetch_thread).start()
    
    def handle_fetch_result(self, result, loading_popup):
        loading_popup.dismiss()
        
        if result['success']:
            self.followers = result['data']
            self.filtered_followers = self.followers.copy()
            self.display_followers()
        else:
            self.show_popup("Error", result.get('error', 'Unknown error'))
    
    def change_view(self, spinner, text):
        if text == 'All Followers':
            self.current_view = "all"
            self.filtered_followers = self.followers.copy()
        elif text == 'AI Recommendations':
            self.current_view = "recommended"
            self.filtered_followers = self.manager.analyzer.get_ai_recommendations(self.followers)
        elif text == 'Male':
            self.current_view = "male"
            self.filtered_followers = [f for f in self.followers if f.get('gender') == 'male']
        elif text == 'Female':
            self.current_view = "female"
            self.filtered_followers = [f for f in self.followers if f.get('gender') == 'female']
        elif text == 'Unknown Gender':
            self.current_view = "unknown"
            self.filtered_followers = [f for f in self.followers if f.get('gender') not in ['male', 'female']]
        
        self.display_followers()
    
    def display_followers(self):
        self.content_grid.clear_widgets()
        if not self.filtered_followers:
            no_results = Label(
                text="No followers to display", 
                size_hint_y=None, 
                height=dp(40),
                color=(0.5, 0.5, 0.5, 1)
            )
            self.content_grid.add_widget(no_results)
            return
            
        for follower in self.filtered_followers:
            card = FollowerCard(follower, self.manager.analyzer)
            self.content_grid.add_widget(card)
    
    def logout(self, instance):
        self.manager.current = 'login'
        self.manager.analyzer = None
        self.followers = []
        self.filtered_followers = []
        self.content_grid.clear_widgets()
        self.username_input.text = ""
        self.view_spinner.text = 'All Followers'
    
    def show_popup(self, title, message):
        Popup(
            title=title,
            content=Label(text=message),
            size_hint=(0.8, 0.3)
        ).open()

class InstagramApp(App):
    def build(self):
        self.title = "Instagram Follower Analyzer"
        Window.size = (dp(900), dp(700)) if not IS_ANDROID else (dp(360), dp(640))
        
        self.screen_manager = ScreenManager()
        self.screen_manager.analyzer = None
        self.screen_manager.add_widget(LoginScreen())
        self.screen_manager.add_widget(MainScreen())
        
        return self.screen_manager

if __name__ == '__main__':
    try:
        import gender_guesser
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer
    except ImportError:
        print("Installing required packages...")
        import subprocess
        subprocess.check_call(['pip', 'install', 'gender-guesser scikit-learn kivy requests numpy selenium'])
    
    InstagramApp().run()