# instagram_follower_analyzer/api/instagram_api.py

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

    @staticmethod
    def get_two_factor_url():
        """
        Instagram's 2FA verification endpoint
        """
        return f"{InstagramAPI.BASE_URL}/api/v1/web/accounts/login/ajax/two_factor/"

    @staticmethod
    def send_two_factor_request(session, headers, payload):
        """
        Sends the 2FA code to Instagram API.
        - session: requests.Session with cookies
        - headers: prepared headers with CSRF token
        - payload: dictionary containing two-factor data
        """
        url = InstagramAPI.get_two_factor_url()
        response = session.post(url, data=payload, headers=headers)
        return response
