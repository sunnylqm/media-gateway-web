import { CircleAlert } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Markdown } from '../lib/markdown';

export type FieldHelpSection = { title?: string; source: string };

// FieldHelp is the "!" beside a form field. Hovering previews the field's note
// from the model's documentation; clicking pins it open, which is also the only
// way to open it on a touch screen. Several sections stack under their own
// titles, for a heading that stands for several fields at once.
export function FieldHelp({
  label,
  sections,
}: {
  label: string;
  sections: FieldHelpSection[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const closing = useRef<number | undefined>(undefined);
  const visible = sections.filter((section) => section.source.trim());

  useEffect(() => () => window.clearTimeout(closing.current), []);

  if (!visible.length) return null;

  const cancelClose = () => window.clearTimeout(closing.current);
  // The pointer crosses a small gap between the icon and the card, so closing
  // waits long enough for it to arrive.
  const scheduleClose = () => {
    if (pinned.current) return;
    cancelClose();
    closing.current = window.setTimeout(() => setOpen(false), 160);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) pinned.current = false;
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="field-help"
          aria-label={t('fieldHelp.aria', { label })}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') scheduleClose();
          }}
          onClick={(event) => {
            // The click decides on its own; Radix's toggle would close a card
            // the hover has just opened.
            event.preventDefault();
            event.stopPropagation();
            cancelClose();
            if (open && pinned.current) {
              pinned.current = false;
              setOpen(false);
            } else {
              pinned.current = true;
              setOpen(true);
            }
          }}
        >
          <CircleAlert size={13} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="field-help-card"
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={cancelClose}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') scheduleClose();
          }}
        >
          {visible.map((section, index) => (
            <div className="field-help-section" key={section.title ?? index}>
              {section.title && <b>{section.title}</b>}
              <Markdown source={section.source} />
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
