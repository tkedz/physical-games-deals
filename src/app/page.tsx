import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <Badge variant="outline">W budowie</Badge>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Okazje na gry pudełkowe
      </h1>
      <p className="text-muted-foreground">
        Zbieramy promocje na fizyczne wydania gier z polskich serwisów z
        okazjami. Wkrótce zobaczysz tu tylko te, które dotyczą gier z Twojej
        listy.
      </p>
    </main>
  );
}
