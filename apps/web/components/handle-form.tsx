import { createProfile } from "@/app/me/actions";
import { inputClass, primaryButtonClass } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";

/** Picking a handle creates the profile. It is permanent, so the form says so. */
export function HandleForm({ suggestion, next }: { suggestion: string; next: string }) {
  return (
    <form action={createProfile} className="max-w-md space-y-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="handle" className="display block text-3xl">
        Choose your handle
      </label>
      <p className="text-sm text-ink-2">
        Your public URL is <span className="font-mono font-semibold text-ink">/u/handle</span>. Lowercase letters, digits and dashes, 3 to 24
        characters. You can&apos;t change it later.
      </p>
      <div className="flex gap-2">
        <input
          id="handle"
          name="handle"
          required
          minLength={3}
          maxLength={24}
          pattern="[a-z0-9\-]{3,24}"
          defaultValue={suggestion}
          autoComplete="username"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
        <SubmitButton pendingLabel="Saving…" className={primaryButtonClass}>
          Save handle
        </SubmitButton>
      </div>
    </form>
  );
}
