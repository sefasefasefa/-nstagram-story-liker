import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Force dark mode globally — this is a developer tool with a dark-first design
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
