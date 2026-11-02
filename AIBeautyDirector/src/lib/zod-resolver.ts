import { set, type FieldErrors, type FieldValues, type Resolver } from 'react-hook-form';
import type { z } from 'zod';

// Minimal zod → react-hook-form bridge (avoids @hookform/resolvers). Error message = i18n key.
export const zodResolver =
  <S extends z.ZodType<FieldValues, FieldValues>>(schema: S): Resolver<z.input<S>, unknown, z.output<S>> =>
  async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors = {};
    const done = new Set<string>();
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (done.has(path)) continue; // first issue per field wins
      done.add(path);
      set(errors, path, { type: issue.code, message: issue.message });
    }
    return { values: {}, errors: errors as FieldErrors<z.input<S>> };
  };
