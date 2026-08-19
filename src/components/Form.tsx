import type { InputHTMLAttributes, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <Input {...props} />
      {hint && <span className="field-hint">{hint}</span>}
    </Label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="form-error" role="alert">{children}</div>;
}
