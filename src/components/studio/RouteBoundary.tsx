import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n';

// Import this boundary eagerly. Neither its fallback nor its styling depends
// on the Studio chunk that may have failed to download.
export class StudioRouteBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <StudioRouteFailure /> : this.props.children;
  }
}

function StudioRouteFailure() {
  const { locale } = useI18n();
  const copy =
    locale === 'zh'
      ? {
          title: '灵感工坊暂时无法打开',
          hint: '页面加载或运行出现问题。可以重新加载，或返回工作台。',
          reload: '重新加载页面',
          back: '返回工作台',
        }
      : {
          title: 'Inspiration Studio could not open',
          hint:
            'The page could not load or render. Reload it or return to the workspace.',
          reload: 'Reload page',
          back: 'Back to workspace',
        };
  return (
    <main className="content">
      <div role="alert">
        <h1>{copy.title}</h1>
        <p>{copy.hint}</p>
      </div>
      <p>
        <button
          type="button"
          className="button primary"
          onClick={() => window.location.reload()}
        >
          {copy.reload}
        </button>{' '}
        <Link className="button secondary" to="/app">
          {copy.back}
        </Link>
      </p>
    </main>
  );
}
