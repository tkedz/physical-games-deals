"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  authErrorMessage,
  signInSchema,
  validateCredentials,
  type FieldErrors,
  type SignInValues,
} from "@/lib/auth/credentials";
import { createClient } from "@/utils/supabase/client";

/**
 * Signs in from the browser, so Supabase's per-IP rate limit falls on the
 * user's own address rather than on the server's.
 */
export function SignInForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors<SignInValues>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = validateCredentials(
      signInSchema,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      let error: unknown;
      try {
        ({ error } = await createClient().auth.signInWithPassword(result.data));
      } catch (thrown) {
        error = thrown;
      }
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // The refresh drops the client router cache, so the next render comes
      // from the server with the new session cookies.
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.email ? "true" : undefined}>
          <FieldLabel htmlFor="sign-in-email">E-mail</FieldLabel>
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-in-email-error" : undefined}
          />
          <FieldError id="sign-in-email-error">{errors.email}</FieldError>
        </Field>
        <Field data-invalid={errors.password ? "true" : undefined}>
          <FieldLabel htmlFor="sign-in-password">Hasło</FieldLabel>
          <Input
            id="sign-in-password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={
              errors.password ? "sign-in-password-error" : undefined
            }
          />
          <FieldError id="sign-in-password-error">{errors.password}</FieldError>
        </Field>
      </FieldGroup>

      {formError && (
        <Alert variant="destructive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Logowanie…" : "Zaloguj się"}
      </Button>
    </form>
  );
}
