import { Aperture } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Media Gateway">
      <span className="brand-mark"><Aperture size={19} strokeWidth={2.2} /></span>
      {!compact && <span className="brand-name">Media Gateway</span>}
    </div>
  );
}
