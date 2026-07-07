import requests
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
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

class InstagramFollowerAnalyzer:
    def __init__(self, session_id: str):
        session_parts = session_id.split('%3A')
        if len(session_parts) < 3:
            raise ValueError("Invalid session_id format. Expected: 'userid%3Asessionid%3Amore'")
            
        self.user_id = session_parts[0]
        self.session_token = session_id
        self.gender_detector = gender_detector.Detector()
        self.ai_model = AIModel()
        
        self.session = requests.Session()
        self.session.cookies.update({
            'sessionid': self.session_token,
            'ds_user_id': self.user_id
        })
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.instagram.com/',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        
        self.csrf_token = self._get_csrf_token()
        if self.csrf_token:
            self.headers['X-CSRFToken'] = self.csrf_token

    def _get_csrf_token(self) -> Optional[str]:
        try:
            response = self.session.get("https://www.instagram.com/", headers=self.headers)
            return self.session.cookies.get('csrftoken')
        except Exception as e:
            print(f"Error getting CSRF token: {e}")
            return None

    def verify_session(self) -> bool:
        try:
            response = self.session.get(
                "https://www.instagram.com/api/v1/accounts/edit/web_form_data/",
                headers=self.headers
            )
            return response.status_code == 200
        except Exception:
            return False

    def get_user_id(self, username: str) -> Optional[str]:
        try:
            response = self.session.get(
                f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}",
                headers={
                    **self.headers,
                    'Referer': f'https://www.instagram.com/{username}/'
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
            url = f"https://www.instagram.com/api/v1/friendships/{user_id}/followers/"
            params = {
                'count': count,
                'search_surface': 'follow_list_page'
            }
            response = self.session.get(url, headers=self.headers, params=params)
            
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
            url = f"https://www.instagram.com/api/v1/friendships/create/{target_user_id}/"
            response = self.session.post(url, headers=self.headers)
            return (response.status_code == 200, 
                   "Success" if response.status_code == 200 else f"Status: {response.status_code}")
        except Exception as e:
            return False, f"Error: {str(e)}"

    def unfollow_user(self, target_user_id: str) -> Tuple[bool, str]:
        try:
            url = f"https://www.instagram.com/api/v1/friendships/destroy/{target_user_id}/"
            response = self.session.post(url, headers=self.headers)
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
        self.height = 300
        self.follower = follower
        self.analyzer = analyzer
        
        # Profile image
        self.image = AsyncImage(
            source=follower.get('profile_pic_url', ''),
            size_hint=(1, 0.7),
            allow_stretch=True
        )
        self.add_widget(self.image)
        
        # User info
        info_layout = BoxLayout(orientation='vertical', size_hint=(1, 0.3))
        
        self.name_label = Label(
            text=f"{follower.get('full_name', '')} (@{follower.get('username', '')})",
            size_hint=(1, 0.4),
            halign='center'
        )
        info_layout.add_widget(self.name_label)
        
        stats_label = Label(
            text=f"Followers: {follower.get('follower_count', 'N/A')} | Following: {follower.get('following_count', 'N/A')}",
            size_hint=(1, 0.3),
            halign='center'
        )
        info_layout.add_widget(stats_label)
        
        gender_label = Label(
            text=f"Gender: {follower.get('gender', 'unknown').title()}",
            size_hint=(1, 0.3),
            halign='center'
        )
        info_layout.add_widget(gender_label)
        
        self.add_widget(info_layout)
        
        # Follow button
        self.follow_btn = Button(
            text=self._get_follow_button_text(),
            size_hint=(1, 0.2),
            on_press=self._toggle_follow
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
        
        popup = Popup(title='Result',
                     content=Label(text=message),
                     size_hint=(0.6, 0.3))
        popup.open()
        
        if success:
            self.follower['followed_by_viewer'] = not self.follower.get('followed_by_viewer', False)
            instance.text = self._get_follow_button_text()

class InstagramApp(App):
    def __init__(self, analyzer: InstagramFollowerAnalyzer, **kwargs):
        super().__init__(**kwargs)
        self.analyzer = analyzer
        self.followers = []
        self.filtered_followers = []
        self.current_view = "all"
        Window.size = (800, 900)

    def build(self):
        self.main_layout = BoxLayout(orientation='vertical')
        
        # Header
        header = BoxLayout(size_hint=(1, 0.1))
        self.username_input = TextInput(hint_text="Enter Instagram username", size_hint=(0.6, 1))
        header.add_widget(self.username_input)
        
        fetch_btn = Button(text="Fetch Followers", size_hint=(0.2, 1))
        fetch_btn.bind(on_press=self.fetch_followers)
        header.add_widget(fetch_btn)
        
        self.main_layout.add_widget(header)
        
        # Filter controls
        filter_controls = BoxLayout(size_hint=(1, 0.1))
        
        view_spinner = Spinner(
            text='View',
            values=('All Followers', 'AI Recommendations', 'Male', 'Female', 'Unknown Gender'),
            size_hint=(0.3, 1)
        )
        view_spinner.bind(text=self.change_view)
        filter_controls.add_widget(view_spinner)
        
        self.main_layout.add_widget(filter_controls)
        
        # Content area
        scroll = ScrollView(size_hint=(1, 0.8))
        self.content_grid = GridLayout(cols=2, spacing=10, size_hint_y=None)
        self.content_grid.bind(minimum_height=self.content_grid.setter('height'))
        scroll.add_widget(self.content_grid)
        self.main_layout.add_widget(scroll)
        
        return self.main_layout
    
    def fetch_followers(self, instance):
        username = self.username_input.text.strip()
        if not username:
            return
            
        result = self.analyzer.get_followers_with_details(username)
        if result['success']:
            self.followers = result['data']
            self.filtered_followers = self.followers.copy()
            self.display_followers()
        else:
            popup = Popup(title='Error',
                         content=Label(text=result.get('error', 'Unknown error')),
                         size_hint=(0.6, 0.3))
            popup.open()
    
    def change_view(self, spinner, text):
        if text == 'All Followers':
            self.current_view = "all"
            self.filtered_followers = self.followers.copy()
        elif text == 'AI Recommendations':
            self.current_view = "recommended"
            self.filtered_followers = self.analyzer.get_ai_recommendations(self.followers)
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
        for follower in self.filtered_followers:
            card = FollowerCard(follower, self.analyzer)
            self.content_grid.add_widget(card)

def main():
    print("Instagram Follower Analyzer\n")
    session_id = input("Enter your Instagram session ID (format: userid%3Asessionid%3Amore): ").strip()
    
    try:
        analyzer = InstagramFollowerAnalyzer(session_id)
        if not analyzer.verify_session():
            print("\n❌ Session verification failed. Please check your credentials.")
            return
        
        print("\n✅ Session verified successfully")
        InstagramApp(analyzer).run()
        
    except ValueError as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    try:
        import gender_guesser
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer
        from kivy import Config
        Config.set('graphics', 'multisamples', '0')
    except ImportError:
        print("Installing required packages...")
        import subprocess
        subprocess.check_call(['pip', 'install', 'gender-guesser scikit-learn kivy'])
    
    main()