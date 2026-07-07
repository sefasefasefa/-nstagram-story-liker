from kivy.uix.boxlayout import BoxLayout
from kivy.uix.image import AsyncImage
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.metrics import dp

class FollowerCard(BoxLayout):
    def __init__(self, follower, analyzer, **kwargs):
        super().__init__(**kwargs)
        self.orientation = 'vertical'
        self.size_hint_y = None
        self.height = dp(300)
        self.spacing = dp(5)
        self.padding = dp(5)
        self.follower = follower
        self.analyzer = analyzer
        
        # Profile image
        self.image = AsyncImage(
            source=follower.get('profile_pic_url', ''),
            size_hint=(1, 0.6),
            allow_stretch=True,
            keep_ratio=True
        )
        self.add_widget(self.image)
        
        # User info
        info_layout = BoxLayout(orientation='vertical', size_hint=(1, 0.3))
        
        # Username and name
        name_label = Label(
            text=f"{follower.get('full_name', '')}\n@{follower.get('username', '')}",
            size_hint=(1, 0.6),
            halign='center',
            valign='middle',
            text_size=(self.width, None),
            shorten=True
        )
        info_layout.add_widget(name_label)
        
        # Gender and stats
        stats_label = Label(
            text=f"Gender: {follower.get('gender', 'unknown').title()}",
            size_hint=(1, 0.2),
            halign='center'
        )
        info_layout.add_widget(stats_label)
        
        self.add_widget(info_layout)
        
        # Follow button
        self.follow_btn = Button(
            text=self._get_button_text(),
            size_hint=(1, 0.1),
            on_press=self._toggle_follow,
            background_normal='',
            background_color=self._get_button_color()
        )
        self.add_widget(self.follow_btn)
    
    def _get_button_text(self):
        if self.follower.get('followed_by_viewer', False):
            return "Following"
        return "Follow"
    
    def _get_button_color(self):
        if self.follower.get('followed_by_viewer', False):
            return (0.8, 0.8, 0.8, 1)  # Gray for following
        return (0.2, 0.6, 1, 1)  # Blue for not following
    
    def _toggle_follow(self, instance):
        if self.follower.get('followed_by_viewer', False):
            success = self.analyzer.unfollow_user(self.follower['user_id'])[0]
        else:
            success = self.analyzer.follow_user(self.follower['user_id'])[0]
        
        if success:
            self.follower['followed_by_viewer'] = not self.follower.get('followed_by_viewer', False)
            instance.text = self._get_button_text()
            instance.background_color = self._get_button_color()