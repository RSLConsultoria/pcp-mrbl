import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/ds/styles.css';
import './styles/mrbl.css';
import './styles/app.css';
import './styles/f3.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
