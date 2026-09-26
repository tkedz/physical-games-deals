import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Logowanie",
};

export default function LoginPage() {
  return (
    <>
      <SignInForm />
      <Link
        href="/signup"
        className={cn(buttonVariants({ variant: "link" }), "self-start px-0")}
      >
        Nie masz konta? Załóż konto
      </Link>
    </>
  );
}
