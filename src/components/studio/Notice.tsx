import { Link } from 'react-router';
import type { Failure } from '../../lib/studio/controller';
import { useStudioCopy } from '../../lib/studio/hooks';

export function StudioNotice({
  error,
  discovery = false,
  retry,
}: {
  error: Failure;
  discovery?: boolean;
  retry?: () => void;
}) {
  const t = useStudioCopy();
  return (
    <div className="studio-notice" role="alert">
      <p>{t(error === 'missing' && discovery ? 'unavailable' : error)}</p>
      <div className="studio-actions">
        {error === 'auth' || error === 'forbidden' ? (
          <Link className="button secondary" to="/app/login">
            {t('signIn')}
          </Link>
        ) : retry ? (
          <button type="button" className="button secondary" onClick={retry}>
            {t(error === 'conflict' ? 'refresh' : 'retry')}
          </button>
        ) : null}
        {error === 'missing' && !discovery && (
          <Link to="/app/create">{t('another')}</Link>
        )}
      </div>
    </div>
  );
}
