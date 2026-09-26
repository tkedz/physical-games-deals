"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  authErrorMessage,
  signUpSchema,
  validateCredentials,
  type FieldErrors,
  type SignUpValues,
} from "@/lib/auth/credentials";
import { createClient } from "@/utils/supabase/client";

/**
 * Creates an account from the browser, so Supabase's per-IP rate limit falls
 * on the user's own address rather than on the server's.
 */
export function SignUpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors<SignUpValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNeedsConfirmation(false);

    const result = validateCredentials(
      signUpSchema,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const { email, password } = result.data;
      let error: unknown;
      let hasSession = false;
      try {
        const response = await createClient().auth.signUp({
          email,
          password,
        });
        error = response.error;
        hasSession = response.data.session !== null;
      } catch (thrown) {
        error = thrown;
      }
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // Only possible with "Confirm email" switched back on in the hosted
      // project: the account exists but cannot sign in yet, so stay here.
      if (!hasSession) {
        setNeedsConfirmation(true);
        return;
      }
      // The refresh drops the client router cache, so the next render comes
      // from the server with the new session cookies.
      router.push("/");
      router.refresh();
    });
  }

  const passwordDescribedBy = errors.password
    ? "sign-up-password-description sign-up-password-error"
    : "sign-up-password-description";

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.email ? "true" : undefined}>
          <FieldLabel htmlFor="sign-up-email">E-mail</FieldLabel>
          <Input
            id="sign-up-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-up-email-error" : undefined}
          />
          <FieldError id="sign-up-email-error">{errors.email}</FieldError>
        </Field>
        <Field data-invalid={errors.password ? "true" : undefined}>
          <FieldLabel htmlFor="sign-up-password">Hasło</FieldLabel>
          <Input
            id="sign-up-password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={passwordDescribedBy}
          />
          <FieldDescription id="sign-up-password-description">
            Co najmniej 8 znaków, w tym mała i wielka litera, cyfra oraz znak
            specjalny, np. ! ? @ #.
          </FieldDescription>
          <FieldError id="sign-up-password-error">{errors.password}</FieldError>
        </Field>
        <Field data-invalid={errors.passwordRepeat ? "true" : undefined}>
          <FieldLabel htmlFor="sign-up-password-repeat">
            Powtórz hasło
          </FieldLabel>
          <Input
            id="sign-up-password-repeat"
            name="passwordRepeat"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.passwordRepeat ? true : undefined}
            aria-describedby={
              errors.passwordRepeat
                ? "sign-up-password-repeat-error"
                : undefined
            }
          />
          <FieldError id="sign-up-password-repeat-error">
            {errors.passwordRepeat}
          </FieldError>
        </Field>
      </FieldGroup>

      {formError && (
        <Alert variant="destructive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      )}
      {needsConfirmation && (
        <Alert role="status">
          <AlertTitle>
            Konto musi zostać potwierdzone, zanim się zalogujesz.
          </AlertTitle>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Zakładanie konta…" : "Załóż konto"}
      </Button>
    </form>
  );
}
