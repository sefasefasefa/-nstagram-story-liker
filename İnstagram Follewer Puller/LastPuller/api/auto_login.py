import time
import random
import requests
from urllib.parse import quote
import json

class InstagramAutoLogin:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "DNT": "1",
            "Origin": "https://www.instagram.com",
            "Referer": "https://www.instagram.com/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "XMLHttpRequest",
            "X-IG-App-ID": "936619743392459",
        })

    def get_session_id(self, username, password, verification_code=None):
        try:
            # Step 1: Get initial cookies and CSRF token
            self.session.get("https://www.instagram.com/accounts/login/")
            csrf_token = self.session.cookies.get("csrftoken")
            if not csrf_token:
                raise Exception("Failed to get CSRF token")

            # Step 2: Login request
            login_payload = {
                "username": username,
                "enc_password": f"#PWD_INSTAGRAM_BROWSER:0:{int(time.time())}:{quote(password)}",
                "queryParams": "{}",
                "optIntoOneTap": "false",
                "trustedDeviceRecords": "{}"
            }

            login_headers = {
                "X-CSRFToken": csrf_token,
                "Content-Type": "application/x-www-form-urlencoded"
            }

            login_response = self.session.post(
                "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
                data=login_payload,
                headers=login_headers
            )

            login_data = login_response.json()
            
            # Check if 2FA is required
            if login_data.get("two_factor_required"):
                print("[INFO] Two-factor authentication required")
                if not verification_code:
                    raise Exception("2FA required but no verification code provided")
                
                return self._handle_two_factor(
                    username, 
                    verification_code, 
                    login_data["two_factor_info"]["two_factor_identifier"]
                )
            
            # Check if login was successful
            if login_data.get("authenticated"):
                print("[INFO] Login successful without 2FA")
                # Make a request to home page to get session cookies
                self.session.get("https://www.instagram.com/")
                return self.session.cookies.get("sessionid")
            
            raise Exception(f"Login failed: {login_data.get('message', 'Unknown error')}")
            
        except Exception as e:
            print(f"[LOGIN ERROR] {str(e)}")
            return None

    def _handle_two_factor(self, username, verification_code, two_factor_identifier):
        """Handle two-factor authentication"""
        try:
            csrf_token = self.session.cookies.get("csrftoken")
            if not csrf_token:
                raise Exception("CSRF token not found for 2FA")

            # Prepare 2FA payload
            two_factor_payload = {
                "username": username,
                "verificationCode": verification_code,
                "identifier": two_factor_identifier,
                "queryParams": json.dumps({"next": "/"}),
                "trustThisDevice": "1",
                "twoFactorIdentifier": two_factor_identifier,
                "verificationMethod": "3"  # 1 = SMS, 3 = Authenticator
            }

            two_factor_headers = {
                "X-CSRFToken": csrf_token,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": "https://www.instagram.com/accounts/login/two_factor",
            }

            # Send 2FA verification
            two_factor_response = self.session.post(
                "https://www.instagram.com/api/v1/web/accounts/login/two_factor/",
                data=two_factor_payload,
                headers=two_factor_headers
            )

            two_factor_data = two_factor_response.json()
            
            if two_factor_data.get("authenticated"):
                print("[INFO] Two-factor authentication successful")
                # Make a request to home page to get session cookies
                self.session.get("https://www.instagram.com/")
                return self.session.cookies.get("sessionid")
            
            raise Exception(f"2FA failed: {two_factor_data.get('message', 'Unknown error')}")
            
        except Exception as e:
            print(f"[2FA ERROR] {str(e)}")
            return None