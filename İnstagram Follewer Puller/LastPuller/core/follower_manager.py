from typing import List, Dict, Optional
from core.analyzer import InstagramFollowerAnalyzer
from core.ai_model import AIModel

class FollowerManager:
    def __init__(self, analyzer: InstagramFollowerAnalyzer):
        self.analyzer = analyzer
        self.ai_model = AIModel()
        self.all_followers = []
        self.filtered_followers = []
        self.current_filter = "all"
        self.last_username = ""

    def fetch_followers(self, username: str) -> Dict:
        """Fetch and store followers for a username"""
        self.last_username = username
        result = self.analyzer.get_followers_with_details(username)
        
        if not result['success']:
            return result
            
        self.all_followers = result['data']
        self.apply_filter(self.current_filter)
        return {'success': True, 'count': len(self.all_followers)}

    def apply_filter(self, filter_type: str) -> List[Dict]:
        """Apply filter to followers"""
        self.current_filter = filter_type
        
        if filter_type == "all":
            self.filtered_followers = self.all_followers.copy()
        elif filter_type == "recommended":
            self.filtered_followers = self.ai_model.get_recommendations(self.all_followers)
        elif filter_type == "male":
            self.filtered_followers = [f for f in self.all_followers if f.get('gender') == 'male']
        elif filter_type == "female":
            self.filtered_followers = [f for f in self.all_followers if f.get('gender') == 'female']
        elif filter_type == "not_following":
            self.filtered_followers = [f for f in self.all_followers if not f.get('followed_by_viewer')]
        else:
            self.filtered_followers = self.all_followers.copy()
        
        return self.filtered_followers

    def refresh_followers(self) -> bool:
        """Refresh the current follower list"""
        if not self.last_username:
            return False
        return self.fetch_followers(self.last_username).get('success', False)

    def follow_user(self, user_id: str) -> bool:
        """Follow a user and update local state"""
        success, _ = self.analyzer.follow_user(user_id)
        if success:
            self._update_follower_status(user_id, True)
        return success

    def unfollow_user(self, user_id: str) -> bool:
        """Unfollow a user and update local state"""
        success, _ = self.analyzer.unfollow_user(user_id)
        if success:
            self._update_follower_status(user_id, False)
        return success

    def _update_follower_status(self, user_id: str, is_following: bool):
        """Update follower status in both lists"""
        for follower in self.all_followers:
            if follower['user_id'] == user_id:
                follower['followed_by_viewer'] = is_following
                break
        
        for follower in self.filtered_followers:
            if follower['user_id'] == user_id:
                follower['followed_by_viewer'] = is_following
                break

    def get_follower_stats(self) -> Dict:
        """Get statistics about followers"""
        return {
            'total': len(self.all_followers),
            'male': len([f for f in self.all_followers if f.get('gender') == 'male']),
            'female': len([f for f in self.all_followers if f.get('gender') == 'female']),
            'following': len([f for f in self.all_followers if f.get('followed_by_viewer')])
        }

    def search_followers(self, query: str) -> List[Dict]:
        """Search followers by username or name"""
        query = query.lower()
        return [
            f for f in self.all_followers
            if query in f['username'].lower() or 
               (f['full_name'] and query in f['full_name'].lower())
        ]