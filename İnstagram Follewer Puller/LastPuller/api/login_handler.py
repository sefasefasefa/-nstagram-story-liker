import re
from typing import Optional

class InstagramLoginHandler:
    @staticmethod
    def extract_session_id(cookie_str: str) -> Optional[str]:
        match = re.search(r'sessionid=([^;]+)', cookie_str)
        return match.group(1) if match else None