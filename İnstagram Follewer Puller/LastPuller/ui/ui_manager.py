from kivy.uix.popup import Popup
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.metrics import dp

class UIManager:
    def __init__(self):
        self.current_popup = None

    def show_popup(self, title, message, size_hint=(0.8, 0.3)):
        """Show a popup message"""
        if self.current_popup:
            self.current_popup.dismiss()
            
        content = BoxLayout(orientation='vertical', spacing=dp(10))
        content.add_widget(Label(text=message))
        
        ok_btn = Button(
            text="OK",
            size_hint=(1, None),
            height=dp(50)
        )
        ok_btn.bind(on_press=lambda x: self.current_popup.dismiss())
        content.add_widget(ok_btn)
        
        self.current_popup = Popup(
            title=title,
            content=content,
            size_hint=size_hint
        )
        self.current_popup.open()

    def show_loading(self, message="Loading..."):
        """Show a loading popup"""
        content = BoxLayout(orientation='vertical')
        content.add_widget(Label(text=message))
        
        self.current_popup = Popup(
            title="Please Wait",
            content=content,
            size_hint=(0.6, 0.2),
            auto_dismiss=False
        )
        self.current_popup.open()

    def hide_popup(self):
        """Hide current popup"""
        if self.current_popup:
            self.current_popup.dismiss()
            self.current_popup = None