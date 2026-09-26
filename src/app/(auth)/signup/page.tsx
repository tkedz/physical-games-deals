import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Rejestracja",
};

export default function SignUpPage() {
  return (
    <>
      <SignUpForm />
      <Link
        href="/login"
        className={cn(buttonVariants({ variant: "link" }), "self-start px-0")}
      >
        Masz już konto? Zaloguj się
      </Link>
    </>
  );
}
