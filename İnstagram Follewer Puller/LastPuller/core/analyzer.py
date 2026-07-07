# instagram_follower_analyzer/core/analyzer.py
import requests
import gender_guesser.detector as gender_detector
from typing import Dict, List, Optional
from api.instagram_api import InstagramAPI

class InstagramFollowerAnalyzer:
    def __init__(self, session_id: str = None, cookies: Dict = None):
        self.gender_detector = gender_detector.Detector()
        self.api = InstagramAPI()
        self.session = requests.Session()

        if session_id:
            self._init_with_session_id(session_id)
        elif cookies:
            self._init_with_cookies(cookies)

        self.csrf_token = self._get_csrf_token()

    def _init_with_session_id(self, session_id: str):
        session_parts = session_id.split('%3A')
        if len(session_parts) < 3:
            raise ValueError("Invalid session_id format")

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
            self.session.get(self.api.BASE_URL, headers=self.api.get_headers())
            return self.session.cookies.get('csrftoken')
        except Exception as e:
            print(f"Error getting CSRF token: {e}")
            return None

    def verify_session(self) -> bool:
        try:
            response = self.session.get(
                f"{self.api.BASE_URL}/api/v1/accounts/edit/web_form_data/",
                headers=self.api.get_headers(self.csrf_token)
            )
            return response.status_code == 200
        except Exception:
            return False

    def get_user_id(self, username: str) -> Optional[str]:
        try:
            response = self.session.get(
                self.api.get_web_profile_info(username),
                headers=self.api.get_headers(self.csrf_token)
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('data', {}).get('user', {}).get('id')
            return None
        except Exception as e:
            print(f"Error getting user ID: {e}")
            return None

    def get_followers_with_details(self, username: str) -> Dict:
        try:
            user_id = self.get_user_id(username)
            if not user_id:
                return {'success': False, 'error': 'Could not get user ID'}

            response = self.session.get(
                self.api.get_followers_url(user_id),
                headers=self.api.get_headers(self.csrf_token),
                params={'count': 200}
            )

            if response.status_code != 200:
                return {'success': False, 'error': f'Status code: {response.status_code}'}

            followers = []
            for user in response.json().get('users', []):
                first_name = user.get('full_name', '').split()[0] if user.get('full_name') else ''
                followers.append({
                    'user_id': user.get('pk'),
                    'username': user.get('username'),
                    'full_name': user.get('full_name'),
                    'profile_pic_url': user.get('profile_pic_url'),
                    'gender': self.gender_detector.get_gender(first_name) if first_name else 'unknown',
                    'followed_by_viewer': user.get('followed_by_viewer', False)
                })

            return {'success': True, 'followers': followers}

        except Exception as e:
            return {'success': False, 'error': str(e)}
