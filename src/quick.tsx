import { createRoot } from 'react-dom/client';
import { QuickCapture } from './features/quick-capture/QuickCapture';
import './styles/quick.css';
import { waitForBackend } from './lib/api/ready';
import { t } from './i18n';
const root = document.getElementById('root');
if (root) {
  root.textContent = t('app.loading');
  void waitForBackend()
    .then(() => createRoot(root).render(<QuickCapture />))
    .catch(() => {
      root.textContent = t('errors.INTERNAL');
    });
}
