import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';
import { waitForBackend } from './lib/api/ready';
import { t } from './i18n';
const root = document.getElementById('root');
if (root) {
  root.textContent = t('app.loading');
  void waitForBackend()
    .then(() => createRoot(root).render(<App />))
    .catch(() => {
      root.textContent = t('errors.INTERNAL');
    });
}
