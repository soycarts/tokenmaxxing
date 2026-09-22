import { createProfile } from "@/app/me/actions";
import { inputClass, primaryButtonClass } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";

/** Picking a handle creates the profile. It is permanent, so the form says so. */
export function HandleForm({ suggestion, next }: { suggestion: string; next: string }) {
  return (
    <form action={createProfile} className="max-w-md space-y-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="handle" className="block font-semibold">
        Choose your handle
      </label>
      <p className="text-sm text-muted">
        Your public URL is <span className="code-cond text-paper">/u/handle</span>. Lowercase letters, digits and dashes, 3 to 24
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
          className={`${inputClass} code-cond`}
        />
        <SubmitButton pendingLabel="Saving…" className={primaryButtonClass}>
          Save handle
        </SubmitButton>
      </div>
    </form>
  );
}
