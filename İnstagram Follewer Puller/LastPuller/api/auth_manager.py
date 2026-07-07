import requests
import json
import time
import random
from urllib.parse import quote
from typing import Optional, Tuple, Dict, Any
from api.login_handler import InstagramLoginHandler
from core.analyzer import InstagramFollowerAnalyzer

class InstagramAutoLoginHTTP:
    def __init__(self):
        self.session = requests.Session()
        self._setup_headers()
        self._setup_request_hooks()

    def _setup_headers(self) -> None:
        """Instagram için gerekli header'ları ayarlar"""
        base_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "X-IG-WWW-Claim": "0",
            "X-Requested-With": "XMLHttpRequest",
            "X-IG-App-ID": "936619743392459",
            "X-ASBD-ID": "129477",
            "Origin": "https://www.instagram.com",
            "Referer": "https://www.instagram.com/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Connection": "keep-alive",
            "DNT": "1",
        }
        self.session.headers.update(base_headers)

    def _setup_request_hooks(self) -> None:
        """İstek öncesi ve sonrası hook'ları ekler"""
        def request_hook(response, *args, **kwargs):
            # Rastgele bekleme ekleyerek bot gibi görünmeyi önle
            time.sleep(random.uniform(0.5, 1.5))
            return response

        self.session.hooks["response"] = [request_hook]

    def get_session_id(self, username: str, password: str, verification_code: str = None) -> Optional[str]:
     """Handles Instagram login and returns session ID or None"""
     try:
        # 1. Initial setup with delays
        time.sleep(random.uniform(2, 4))
        
        # 2. Get initial cookies
        self._initial_request()
        
        # 3. Perform login with retry logic
        max_retries = 2
        for attempt in range(max_retries):
            time.sleep(random.uniform(1, 3))
            login_response = self._perform_login(username, password)
            
            # Handle response
            if isinstance(login_response, dict):
                if login_response.get('authenticated'):
                    break  # Success
                
                error_type = login_response.get('error_type')
                
                # Specific error handling
                if error_type == 'UserInvalidCredentials':
                    if login_response.get('user'):
                        print("[ERROR] Account temporarily locked. Try again later.")
                        return None
                    else:
                        if attempt < max_retries - 1:
                            print("[WARNING] Invalid credentials, retrying...")
                            continue
                        print("[ERROR] Invalid username/password")
                        return None
                        
                elif error_type == 'checkpoint_challenge_required':
                    print("[ERROR] Account verification required")
                    return None
            
            time.sleep(random.uniform(5, 10))  # Wait before retry

        # 4. Handle 2FA if required
        if login_response.get('two_factor_required'):
            if not verification_code:
                print("[ERROR] 2FA code required but not provided")
                return None
            return self._handle_two_factor(
                username,
                verification_code,
                login_response["two_factor_info"]["two_factor_identifier"]
            )

        # 5. Finalize session
        return self._finalize_login()

     except Exception as e:
        print(f"[FATAL ERROR] {str(e)}")
        return None

    def _initial_request(self) -> None:
        """Başlangıç isteği ve cookie alımı"""
        response = self.session.get(
            "https://www.instagram.com/accounts/login/",
            timeout=10
        )
        response.raise_for_status()

        if "csrftoken" not in self.session.cookies:
            raise Exception("CSRF token alınamadı")

    def _perform_login(self, username: str, password: str) -> Dict[str, Any]:
     login_payload = {
        "username": username,
        "enc_password": self._encrypt_password(password),
        "queryParams": json.dumps({"source": "auth_switcher"}),
        "optIntoOneTap": "false",
        "trustedDeviceRecords": "{}",
        "jazoest": self._generate_jazoest(),
    }

    # Add these additional headers
     self.session.headers.update({
        "X-CSRFToken": self.session.cookies["csrftoken"],
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Instagram-AJAX": "1007616494",  # Random static value
        "X-Requested-With": "XMLHttpRequest",
    })

     try:
        response = self.session.post(
            "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
            data=login_payload,
            timeout=15
        )
        
        data = response.json()
        print(f"[DEBUG] Full login response: {data}")
        
        # Handle the specific error case we're seeing
        if isinstance(data, dict) and data.get("authenticated") is False:
            error_type = data.get("error_type", "unknown_error")
            
            if error_type == "UserInvalidCredentials":
                # This could mean either bad credentials OR account locked
                return {
                    "authenticated": False,
                    "status": "account_locked" if data.get("user") else "bad_credentials",
                    "message": "Account temporarily locked" if data.get("user") else "Invalid username/password",
                    "error_type": error_type
                }
            
        return data
        
     except Exception as e:
        print(f"[NETWORK ERROR] {str(e)}")
        return {
            "authenticated": False,
            "status": "network_error",
            "message": str(e)
        }

    def _handle_two_factor(self, username: str, verification_code: str, two_factor_identifier: str) -> Optional[str]:
        """2FA doğrulama işlemini gerçekleştirir"""
        try:
            two_factor_payload = {
                "username": username,
                "verificationCode": verification_code,
                "identifier": two_factor_identifier,
                "queryParams": json.dumps({"next": "/"}),
                "trustThisDevice": "1",
                "twoFactorIdentifier": two_factor_identifier,
                "verificationMethod": "3",  # 1=SMS, 3=Authenticator
                "jazoest": self._generate_jazoest(),
            }

            self.session.headers.update({
                "X-CSRFToken": self.session.cookies["csrftoken"],
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": "https://www.instagram.com/accounts/login/two_factor",
            })

            response = self.session.post(
                "https://www.instagram.com/api/v1/web/accounts/login/two_factor/",
                data=two_factor_payload,
                timeout=15
            )
            response.raise_for_status()

            data = response.json()
            if not data.get("authenticated", False):
                raise Exception(f"2FA doğrulama başarısız: {data.get('message', 'Bilinmeyen hata')}")

            return self._finalize_login()
            
        except Exception as e:
            print(f"[2FA HATASI] {str(e)}")
            return None

    def _finalize_login(self) -> Optional[str]:
        """Girişi tamamlar ve session ID'yi döndürür"""
        response = self.session.get(
            "https://www.instagram.com/",
            timeout=10
        )
        response.raise_for_status()

        if "sessionid" not in self.session.cookies:
            raise Exception("Session ID alınamadı")

        return self.session.cookies["sessionid"]

    def _encrypt_password(self, password: str) -> str:
        """Instagram'ın beklediği formatta şifre encrypt"""
        time_now = int(time.time())
        return f"#PWD_INSTAGRAM_BROWSER:0:{time_now}:{quote(password)}"

    def _generate_jazoest(self) -> str:
        """Instagram'ın beklediği jazoest parametresi"""
        return str(random.randint(20000, 30000))  # Rastgele jazoest değeri


class AuthManager:
    def __init__(self):
        self.auto_login = InstagramAutoLoginHTTP()
        self.login_handler = InstagramLoginHandler()
        self.current_session = None

    def pc_auto_login(self, username: str, password: str, verification_code: str = None) -> Tuple[Optional[str], Optional[str]]:
        """
        Otomatik giriş yapar
        :return: (session_id, error_message)
        """
        try:
            session_id = self.auto_login.get_session_id(username, password, verification_code)
            if session_id and self.validate_session(session_id):
                self.current_session = session_id
                return session_id, None
            return None, "Geçersiz kimlik bilgileri veya session doğrulama başarısız"
        except Exception as e:
            return None, str(e)
    
    def validate_session(self, session_id: str) -> bool:
        """
        Session'ın geçerli olup olmadığını kontrol eder
        """
        try:
            analyzer = InstagramFollowerAnalyzer(session_id=session_id)
            return analyzer.verify_session()
        except Exception as e:
            print(f"Session doğrulama hatası: {str(e)}")
            return False

    def manual_login(self, session_id: str) -> bool:
        """
        Manuel olarak session ID ekler
        """
        if self.validate_session(session_id):
            self.current_session = session_id
            return True
        return False

    def logout(self) -> None:
        """
        Mevcut session'ı temizler
        """
        self.current_session = None

    def check_cookies(self, cookie_str: str) -> Tuple[bool, Optional[str]]:
        """
        Cookie string'ini kontrol eder
        :return: (is_valid, session_id)
        """
        try:
            session_id = self.login_handler.extract_session_id(cookie_str)
            if session_id:
                return (self.validate_session(session_id), session_id)
            return (False, None)
        except Exception as e:
            print(f"Cookie kontrol hatası: {str(e)}")
            return (False, None)

    def get_current_session(self) -> Optional[str]:
        """
        Mevcut session ID'yi döndürür
        """
        return self.current_session

    def is_logged_in(self) -> bool:
        """
        Kullanıcının giriş yapıp yapmadığını kontrol eder
        """
        if not self.current_session:
            return False
        return self.validate_session(self.current_session)

    def refresh_session(self) -> bool:
        """
        Session'ı yeniler
        """
        if not self.current_session:
            return False
            
        try:
            if self.validate_session(self.current_session):
                return True
                
            # Yenileme mantığı buraya eklenebilir
            return False
        except Exception as e:
            print(f"Session yenileme hatası: {str(e)}")
            return False