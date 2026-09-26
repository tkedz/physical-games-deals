import {
  isAuthError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";
import { z } from "zod";

// Trim before the format check: z.email() on its own would judge the
// untrimmed value, so an address pasted with a trailing space would fail.
const email = z
  .string()
  .trim()
  .pipe(z.email({ error: "Podaj adres e-mail w poprawnym formacie." }));

/**
 * Sign-in only asks for a non-empty password. A length rule here would lock
 * out an account created under an older, looser rule.
 */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Podaj hasło." }),
});

// The hosted project's "lower_upper_letters_digits_symbols" rule, copied
// verbatim: a password needs one character from each set. Letters are ASCII
// only, so "ą" is neither lower- nor uppercase, and only these symbols count.
// Source: https://supabase.com/docs/guides/auth/password-security
const requiredCharacterSets = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789",
  "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~",
];

/** Whether a password satisfies Supabase's required character sets. */
export function hasRequiredCharacters(password: string): boolean {
  return requiredCharacterSets.every((set) =>
    [...set].some((character) => password.includes(character)),
  );
}

/**
 * Mirrors the hosted Auth rules, so a password Supabase would reject as
 * `weak_password` never leaves the form. 72 is bcrypt's limit: Supabase
 * rejects a longer password with `validation_failed`.
 */
export const signUpSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, { error: "Hasło musi mieć co najmniej 8 znaków." })
      .max(72, { error: "Hasło może mieć najwyżej 72 znaki." })
      .refine(hasRequiredCharacters, {
        error:
          "Hasło musi zawierać małą i wielką literę, cyfrę oraz znak specjalny.",
      }),
    passwordRepeat: z.string(),
  })
  .refine((values) => values.password === values.passwordRepeat, {
    error: "Hasła nie są takie same.",
    path: ["passwordRepeat"],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

/** One message per field: the one its FieldError shows. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type CredentialsResult<T> =
  { success: true; data: T } | { success: false; errors: FieldErrors<T> };

/**
 * Runs a credential schema over raw form input. Keeps the first issue for each
 * field, so a field never shows two messages at once.
 */
export function validateCredentials<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  input: unknown,
): CredentialsResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: FieldErrors<T> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T | undefined;
    if (field !== undefined && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}

/**
 * Polish copy for an error returned (or thrown) by a supabase-js auth call.
 *
 * Branches on the error code, never on `error.message`: the message is English
 * server text that may change without notice. Anything unrecognised, a
 * non-Supabase error included, gets the generic message.
 */
export function authErrorMessage(error: unknown): string {
  // AuthWeakPasswordError is not an AuthApiError, so it needs its own guard.
  if (isAuthWeakPasswordError(error)) {
    return "To hasło jest zbyt słabe. Wybierz inne.";
  }
  // Network failures and 5xx responses carry no code.
  if (isAuthRetryableFetchError(error)) {
    return "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
  }
  if (isAuthError(error)) {
    switch (error.code) {
      case "invalid_credentials":
        return "Nieprawidłowy e-mail lub hasło.";
      case "user_already_exists":
        return "Konto z tym adresem już istnieje. Zaloguj się.";
      case "email_address_invalid":
        return "Tego adresu e-mail nie da się użyć. Podaj inny.";
      case "over_request_rate_limit":
        return "Zbyt wiele prób. Spróbuj ponownie za kilka minut.";
      case "email_not_confirmed":
        return "To konto nie ma potwierdzonego adresu e-mail.";
    }
  }
  return "Coś poszło nie tak. Spróbuj ponownie.";
}
