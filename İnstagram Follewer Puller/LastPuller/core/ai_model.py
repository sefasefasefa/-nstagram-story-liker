from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
import numpy as np
from typing import List, Dict

class AIModel:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=100)
        self.model = KMeans(n_clusters=5, random_state=42)

    def get_recommendations(self, followers: List[Dict]) -> List[Dict]:
        texts = [f"{f.get('full_name', '')} {f.get('username', '')}" for f in followers]
        X = self.vectorizer.fit_transform(texts)
        clusters = self.model.fit_predict(X)
        main_cluster = np.argmax(np.bincount(clusters))
        
        return [
            follower for i, follower in enumerate(followers)
            if clusters[i] != main_cluster
        ][:10]