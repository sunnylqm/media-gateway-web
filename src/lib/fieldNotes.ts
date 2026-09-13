import type { RequestForm } from '../types';
import { mediaSlots } from './requestForm';

// A model's field notes are one Markdown document with a `## <field>` section
// per field of its request form. The key is `prompt`, a parameter name, or a
// media role such as `first_frame` — the same names the form itself uses, so a
// section lands beside its field without a separate mapping.

const sectionHeading = /^##\s+(\S+)\s*$/;

export function parseFieldNotes(source?: string): Map<string, string> {
  const sections = new Map<string, string>();
  let key = '';
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (key && body) sections.set(key, body);
    lines = [];
  };
  for (const line of (source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const match = sectionHeading.exec(line);
    if (match) {
      flush();
      key = match[1];
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

// fieldNoteKeys lists the fields a model's form has, in the order the form
// shows them, so an editor can tell which sections will be seen.
export function fieldNoteKeys(form?: RequestForm): string[] {
  if (!form) return [];
  const keys = ['prompt'];
  for (const slot of mediaSlots(form)) {
    if (slot.role && !keys.includes(slot.role)) keys.push(slot.role);
  }
  for (const parameter of form.parameters ?? []) {
    if (!keys.includes(parameter.name)) keys.push(parameter.name);
  }
  return keys;
}
