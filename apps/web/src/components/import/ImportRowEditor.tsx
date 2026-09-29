import { Input } from '@/components/ui/input';

export interface ImportField {
  key: string;
  label: string;
  options?: readonly { value: string; label: string }[];
}

interface Props {
  sourceRow: number;
  raw: Record<string, string>;
  fields: readonly ImportField[];
  onChange: (key: string, value: string) => void;
}

export function ImportRowEditor({ sourceRow, raw, fields, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label={`Ubah baris ${sourceRow}`}
      className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {fields.map((field) => {
        const value = raw[field.key] ?? '';
        const id = `import-row-${sourceRow}-${field.key}`;
        return (
          <label key={field.key} htmlFor={id} className="grid gap-1 text-sm font-medium">
            {field.label}
            {field.options ? (
              <select
                id={id}
                value={value}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Pilih {field.label.toLowerCase()}</option>
                {value && !field.options.some((option) => option.value === value) && (
                  <option value={value}>Nilai sekarang: {value}</option>
                )}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type="text"
                value={value}
                autoComplete="off"
                spellCheck={false}
                className="h-11"
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
