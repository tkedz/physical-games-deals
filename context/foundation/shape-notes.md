---
project: null
context_type: greenfield
created: 2026-09-16
updated: 2026-09-16
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: null
timeline_budget:
  mvp_weeks: 4
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "szum + rozproszenie źródeł + ulotność okazji (trzy warstwy naraz)"
    - topic: "moment of pain"
      decision: "wieczorny obchód źródeł na zapas, bez konkretnego celu"
    - topic: "cost today"
      decision: "mieszanka — część tytułów śledzona aktywnie (koszt: czas), reszta odpuszczona (koszt: przegapione okazje)"
    - topic: "primary persona scope"
      decision: "nisza kolekcjonerów fizycznych wydań; otwarta rejestracja"
    - topic: "insight"
      decision: "trzy naraz: fizyczne toną w cyfrowych; wpisów nie da się filtrować regułami; alert na tytuł, nie na kategorię"
    - topic: "auth strategy"
      decision: "e-mail + hasło; własne konto na użytkownika. Uzasadnienie: pozwala przekazać gotowe konto testowe osobie postronnej"
    - topic: "role model"
      decision: "płaski — brak ról administracyjnych w MVP"
    - topic: "MVP scope-down"
      decision: "przyjęte cięcie: jeden kanał w v1. WYCOFANE po rewizji: cięcie 'lista obserwowanych bez zewnętrznego katalogu gier' — patrz topic 'catalog in v1'. Odrzucone: zbieranie poza aplikacją, dopasowanie wyłącznie proste"
    - topic: "mvp timeline"
      decision: "4 tygodnie pracy wieczorami (3 przed rewizją zakresu, +1 za wciągnięcie katalogu do v1); próg 3 tygodni przekroczony świadomie, patrz Timeline acknowledgment"
    - topic: "v1 pipeline scope (collect vs process)"
      decision: "NIEROZSTRZYGNIĘTE — patrz Open Questions #2"
    - topic: "catalog in v1"
      decision: "REWIZJA — identyfikacja gry z zewnętrznego katalogu wchodzi do v1 jako must-have. Uzasadnienie: trzy przyjęte kontrargumenty sokratejskie (FR-003 literówki i warianty wydań, FR-007 bezsens oznaczania zakupu, FR-005 brak historii cen) mają wspólny korzeń — brak tożsamości gry. Odrębny widok gry ze wszystkimi ofertami odłożony jako nice-to-have"
    - topic: "catalog scope"
      decision: "katalog identyfikuje GRĘ, nie konkretne wydanie. Nie rozstrzyga pudełka kontra klucza ani regionu — ta decyzja nadal zapada wyłącznie na treści wpisu źródłowego"
    - topic: "items outside catalog"
      decision: "brak wpisów tekstowych — obserwować można wyłącznie gry obecne w katalogu. Przyjęty koszt: gry niszowe i wydania wyłącznie polskie mogą być nieosiągalne"
    - topic: "terminology"
      decision: "'wishlista' zastąpiona przez 'listę obserwowanych' — trafniejsze, bo produkt śledzi ceny, a nie deklaruje chęć posiadania"
    - topic: "watchlist item shape"
      decision: "pozycja wskazuje grę z katalogu oraz opcjonalnie platformę; platforma zawęża dopasowanie"
    - topic: "watchlist deletion"
      decision: "dla użytkownika trwałe; ślad śledzenia zachowany w danych"
    - topic: "price reference in v1"
      decision: "procentowa zniżka z wpisu źródłowego. Najniższa widziana cena pozostaje poza v1 — po wciągnięciu katalogu blokadą nie jest już brak identyfikacji gry, lecz brak zgromadzonej historii, która powstaje dopiero z tygodniami zbierania"
    - topic: "empty state"
      decision: "komunikat wyjaśniający wraz z czasem ostatniego odświeżenia danych"
    - topic: "deal expiry"
      decision: "okazja znika po dacie końca podanej we wpisie; bez daty pozostaje"
    - topic: "freshness commitment"
      decision: "okazja widoczna nie później niż 6 h od publikacji we wpisie źródłowym"
    - topic: "list purity threshold"
      decision: "NIEROZSTRZYGNIĘTE — patrz Open Questions #3"
    - topic: "view latency"
      decision: "brak progu czasowego; zobowiązanie do widocznej informacji o postępie"
    - topic: "devices"
      decision: "telefon i komputer równorzędnie"
    - topic: "product framing"
      decision: "aplikacja webowa; kilka osób; twardy termin 2026-11-04; praca po godzinach"
    - topic: "non-goals"
      decision: "bez odpytywania sklepów, bez własnej oceny ceny, bez powiadomień, bez obietnicy kompletności, bez identyfikacji konkretnego wydania"
    - topic: "project name"
      decision: "NIEROZSTRZYGNIĘTE — świadomie odłożone; patrz Open Questions #1"
  frs_drafted: 7
  quality_check_status: accepted
---

# Shape Notes

## Seed idea (verbatim)

> Aplikacja do śledzenia okazji na gry fizyczne. Cykliczne pobieranie RSS (docelowo lowcygier.pl, pepper.pl, cenograj.pl), LLM strukturyzuje wpisy pisane przez ludzi i odrzuca wersje cyfrowe. Użytkownik tworzy wishlistę gier i widzi okazje na swoje tytuły z ceną i odnośnikiem do zakupu. Do rozstrzygnięcia: sposób dopasowania wpisu do pozycji na wishliście (platformy, warianty nazw); czy MVP obejmuje jeden kanał czy trzy; czy wishlista to wolny tekst czy katalog gier.

Trzecie z pytań seeda zostało rozstrzygnięte w rewizji z 2026-09-16 na rzecz katalogu gier. Termin „wishlista" zastąpiony w całym dokumencie przez „listę obserwowanych"; w cytacie powyżej pozostaje w formie oryginalnej.

## Vision & Problem Statement

Gracz kolekcjonujący fizyczne wydania gier musi śledzić kilka niezależnych źródeł informujących o promocjach. Ból ma trzy warstwy naraz: **szum** — wśród ofert większość nie dotyczy tego, czego szuka; **rozproszenie** — nie ma jednego widoku, trzeba obchodzić źródła po kolei; **ulotność** — okno okazji jest krótkie, więc sprawdzenie raz na tydzień bywa za rzadkie. Ból uderza w momencie wieczornego obchodu źródeł „na zapas", bez konkretnego celu — większość tego czasu to strata. Dzisiejszy koszt to mieszanka: część tytułów gracz śledzi aktywnie i płaci za to czasem, resztę odpuścił i płaci przegapionymi okazjami.

Wgląd, który uzasadnia ten produkt, ma trzy składniki. Po pierwsze, dla kolekcjonera wydań pudełkowych większość okazji na tych portalach jest bezużyteczna, bo dotyczy kluczy i wersji cyfrowych — żadne źródło nie traktuje rozróżnienia fizyczne/cyfrowe jako pierwszorzędnego filtra. Po drugie, treść wpisów piszą ludzie i każdy inaczej, więc dotąd odsianie ich wymagało czytania wszystkiego ręcznie; automatyczna normalizacja takich wpisów stała się osiągalna dopiero niedawno. Po trzecie, istniejące powiadomienia działają na słowach kluczowych i kategoriach, a potrzebne jest dopasowanie do konkretnej listy tytułów, które gracz naprawdę chce mieć na półce.

## User & Persona

Kolekcjoner fizycznych wydań gier. Prowadzi własną listę tytułów, które chce kupić, i sięgnąłby po ten produkt zamiast wieczornego obchodu portali — chce zobaczyć w jednym miejscu wyłącznie okazje dotyczące gier ze swojej listy, w wersji pudełkowej, z ceną i odnośnikiem do zakupu.

Zakres persony: nisza kolekcjonerów z otwartą rejestracją — dowolny kolekcjoner fizycznych wydań może założyć konto. Oznacza to konta i izolację danych między użytkownikami od początku.

## Success Criteria

### Primary
- Zalogowany użytkownik dodaje grę do listy obserwowanych i bez żadnej dalszej akcji widzi listę okazji dotyczących tej gry — wyłącznie wersje fizyczne, każda z ceną i odnośnikiem prowadzącym do wpisu źródłowego.
- Lista powstaje z wpisów pisanych przez ludzi, których użytkownik nie musi czytać ani filtrować samodzielnie.

### Secondary
- Kolejne źródła okazji dołączone do przetwarzania po tym, jak pierwszy przepływ działa. Zwiększa pokrycie, nie zmienia natury produktu — samo w sobie nie dowodzi, że produkt zadziałał.

### Guardrails
- Żadna wersja cyfrowa nie przecieka na listę okazji fizycznych. Fałszywe trafienie niszczy zaufanie do filtra szybciej niż przeoczona okazja — to odwrotność szumu, który produkt usuwa.
- Lista obserwowanych jednego użytkownika nigdy nie jest widoczna dla innego, również przez manipulację adresem.
- Odnośnik przy okazji prowadzi dokładnie do wpisu źródłowego, z którego okazja pochodzi — nigdy do innej oferty ani do pustej strony.
- Koszt automatycznego przetwarzania wpisów nie rośnie w sposób niekontrolowany wraz z liczbą źródeł i dni zbierania.

## Timeline acknowledgment

Acknowledged on 2026-09-16: 4-tygodniowe MVP przekracza domyślny trzytygodniowy próg i wymaga wytrwałości przez ciąg wieczorów; użytkownik przyjął ten koszt świadomie, wybierając wciągnięcie katalogu gier do v1 zamiast odłożenia go poza pierwszą wersję.

## User Stories

### US-01: Kolekcjoner widzi okazje na grę ze swojej listy obserwowanych

- **Given** zalogowany użytkownik z co najmniej jedną grą na liście obserwowanych
- **When** otwiera widok okazji
- **Then** widzi wyłącznie okazje na wersje fizyczne gier ze swojej listy, każda z ceną i odnośnikiem do wpisu źródłowego

#### Acceptance Criteria
- Pozycja listy obserwowanych z podaną platformą zawęża trafienia do tej platformy; pozycja bez platformy dopuszcza trafienia na dowolnej platformie. Przykład użytkownika: „Silent Hill 2" z platformą PS5 zwraca wyłącznie oferty na PS5, ta sama gra bez wskazanej platformy zwraca również ofertę na Xbox.
- Gdy żadna okazja nie pasuje do listy obserwowanych, widok pokazuje komunikat wyjaśniający wraz z informacją, kiedy dane były ostatnio odświeżane — użytkownik ma odróżnić brak okazji od zepsutego przetwarzania.
- Okazja, której wpis źródłowy podaje datę końca ważności, przestaje być pokazywana po tej dacie. Okazje bez podanej daty pozostają na liście.
- Na liście nie pojawia się żadna okazja dotycząca wersji cyfrowej.
- Przy okazji widnieje procentowa zniżka, o ile wpis źródłowy ją podaje; jej brak nie ukrywa okazji.

## Functional Requirements

### Konto i dostęp
- FR-001: Użytkownik może założyć konto parą e-mail + hasło i zalogować się na nie. Priority: must-have
  > Socrates: Kontrargument rozważony: "przez długi czas jedynym użytkownikiem będzie autor, więc warstwa kont spowalnia budowę; magic link lub logowanie zewnętrznym kontem byłyby tańsze". Rozstrzygnięcie: zachowane w formie hasłowej — uwierzytelnianie hasłem pozwala przygotować gotowe konto testowe i przekazać je osobie postronnej, która ma obejrzeć produkt bez zakładania własnego konta i budowania listy obserwowanych od zera. Magic link i logowanie zewnętrznym kontem tego nie umożliwiają.
  > Socrates (dawne FR-002, logowanie): Kontrargument przyjęty: "rejestracja i logowanie to jeden mechanizm opisany dwa razy". Rozstrzygnięcie: scalone w FR-001. Numer FR-002 pozostaje nieużywany, żeby nie przenumerowywać pozostałych wymagań.

### Lista obserwowanych
- FR-003: Użytkownik może wyszukać grę w zewnętrznym katalogu gier i dodać ją do swojej listy obserwowanych, opcjonalnie wskazując platformę. Priority: must-have
  > Socrates: Kontrargument przyjęty: "jedno pole, dwie różne reguły — obecność platformy w tekście zmienia zachowanie dopasowania, ale nic tego nie sygnalizuje; użytkownik nie ma jak odgadnąć, że dopisanie »ps5« zawęziło mu wyniki". Rozstrzygnięcie pierwotne: rozdzielenie tytułu i platformy na dwie osobne wartości. Rozstrzygnięcie po rewizji z 2026-09-16: gra pochodzi z katalogu, więc tożsamość tytułu przestaje zależeć od tego, co użytkownik wpisze; platforma pozostaje osobną, opcjonalną wartością zawężającą dopasowanie. Znika też drugi zarzut z tej samej rundy — literówka nie może już cicho wyłączyć tytułu.
  > Socrates (dawne FR-008, wyszukiwarka katalogu): Kontrargument przyjęty i następnie przeważony: "zewnętrzne API to nowy tryb awarii, limity i utrzymanie; dopóki dopasowanie na tekście działa, użytkownik nie dostaje nic, czego nie miał". Rozstrzygnięcie po rewizji: FR-008 scalone z FR-003 i podniesione do must-have, bo trzy przyjęte wcześniej kontrargumenty (literówki i warianty wydań, bezsens oznaczania zakupu, niemożność zbierania historii cen) mają wspólny korzeń w braku tożsamości gry. Nowa zależność i jej tryby awarii pozostają przyjętym kosztem. Numer FR-008 pozostaje nieużywany.
- FR-004: Użytkownik może usunąć grę ze swojej listy obserwowanych. Priority: must-have
  > Socrates: Kontrargument przyjęty: "razem z pozycją przepada informacja, że użytkownik kiedykolwiek ten tytuł śledził — a to ona byłaby podstawą późniejszej historii cen". Rozstrzygnięcie: usunięcie jest widoczne dla użytkownika jako trwałe (pozycja znika z jego widoku), ale ślad śledzenia pozostaje w danych i nie jest kasowany.
- FR-007: Użytkownik może oznaczyć grę z listy obserwowanych jako zakupioną. Priority: nice-to-have
  > Socrates: Kontrargument przyjęty (zgłoszony przez samego użytkownika): "przy wpisie tekstowym »zakupione« nie jest informacją o żadnej rzeczywistej grze". Rozstrzygnięcie po rewizji z 2026-09-16: blokada zniesiona — pozycja wskazuje teraz grę z katalogu, więc oznaczenie niesie realną informację. Priorytet pozostaje nice-to-have, bo samo w sobie nie jest potrzebne do przejścia głównego przepływu.

### Okazje
- FR-005: Użytkownik może zobaczyć okazje dopasowane do gier ze swojej listy obserwowanych, ograniczone do wersji fizycznych, z ceną oraz procentową zniżką, jeśli wpis źródłowy ją podaje. Priority: must-have
  > Socrates: Kontrargument przyjęty: "sama cena nic nie mówi — bez informacji, ile ta gra kosztowała wcześniej albo ile kosztuje gdzie indziej, użytkownik i tak musi to sprawdzić sam, czyli wraca do obchodu źródeł". Rozstrzygnięcie: w v1 punktem odniesienia jest procentowa zniżka podana we wpisie źródłowym, o ile w nim występuje. Najniższa widziana cena tytułu pozostaje poza v1 — po rewizji z 2026-09-16 blokadą nie jest już brak identyfikacji gry, lecz brak zgromadzonej historii, która powstaje dopiero z tygodniami zbierania.
- FR-006: Użytkownik może przejść z okazji do wpisu źródłowego. Priority: must-have
  > Socrates: Rozważone kontrargumenty: martwy odnośnik po wygaśnięciu oferty obciąża wizerunkowo aplikację; odnośnik prowadzi do wpisu, nie do sklepu, więc zostaje jeszcze jeden skok. Rozstrzygnięcie: brak kontrargumentu uznanego za wiążący — FR-006 zostaje bez zmian. Drugi z zarzutów jest częściowo zaadresowany regułą zapasowego odnośnika (patrz Business Logic).
- FR-009: Użytkownik może otworzyć widok wybranej gry i zobaczyć wszystkie znalezione dla niej oferty, niezależnie od swojej listy obserwowanych. Priority: nice-to-have
  > Socrates: Rozważony kontrargument: drugie wejście do produktu częściowo przywraca przeglądanie ofert, których użytkownik nie szukał — czyli ten sam szum, który produkt usuwa. Przeciwwaga: zakres jest zawężony do jednej gry, a widok działa przy pustej liście obserwowanych, co odpowiada na zarzut "pusta lista wygląda jak awaria" z FR-005. Rozstrzygnięcie: wchodzi po domknięciu głównego przepływu, jeśli zostanie czas.

## Non-Functional Requirements

- Okazja opublikowana we wpisie źródłowym jest widoczna w produkcie nie później niż 6 godzin po publikacji.
- Użytkownik widzi ciągłą informację o postępie zawsze, gdy oczekiwanie na listę okazji trwa dłużej niż moment — nigdy pusty ekran bez wyjaśnienia. Produkt nie deklaruje progu czasowego dla tego widoku.
- Ten sam widok okazji daje się wygodnie obsłużyć zarówno na telefonie, jak i na komputerze.
- Lista obserwowanych i dopasowane do niej okazje jednego użytkownika pozostają niedostępne dla każdego innego użytkownika.
- Udział pozycji nienależących do listy (wersje cyfrowe, oferty na niewłaściwą grę) ma być ograniczony, ale próg nie został zadeklarowany w v1 — patrz Open Questions.

## Business Logic

Z każdego wpisu pisanego przez człowieka powstaje ustrukturyzowana okazja — rozpoznana gra, platforma, cena, a jeśli wpis je zawiera: data wygaśnięcia i procentowa zniżka, wraz z odnośnikiem prowadzącym do sklepu, a gdy takiego w treści nie ma — do wpisu w agregatorze — która trafia przed oczy użytkownika wyłącznie wtedy, gdy dotyczy wersji fizycznej gry obecnej na jego liście obserwowanych.

Reguła konsumuje dwa wejścia widoczne dla użytkownika: treść okazji opublikowaną przez innego człowieka, pozbawioną jednolitej struktury i pisaną za każdym razem inaczej, oraz listę obserwowanych — zbiór gier wybranych z katalogu, każda z opcjonalnie wskazaną platformą. Z pierwszego wejścia powstaje uporządkowany opis oferty, z drugiego — kryterium, według którego oferta zostaje pokazana albo odrzucona.

Tożsamość gry pochodzi z zewnętrznego katalogu gier: zarówno pozycja listy obserwowanych, jak i gra rozpoznana we wpisie o okazji wskazują tę samą, kanoniczną pozycję katalogu. Dzięki temu dopasowanie przestaje być porównaniem dwóch dowolnych ciągów znaków. Katalog identyfikuje **grę, nie konkretne wydanie** — nie rozstrzyga, czy oferta dotyczy pudełka czy klucza, ani jakiego regionu dotyczy. Gra nieobecna w katalogu nie może zostać dodana do listy obserwowanych; przyjętym kosztem są tytuły niszowe i wydania wyłącznie polskie, których katalog może nie znać.

Wyjściem reguły są dwie rozłączne decyzje odsiewające oraz jeden uporządkowany rekord. Pierwsza decyzja: czy okazja dotyczy wydania fizycznego — oferty na wersje cyfrowe i klucze są odrzucane, nawet gdy dotyczą gry z listy obserwowanych. Ta decyzja zapada wyłącznie na treści wpisu źródłowego, bo katalog jej nie rozstrzyga. Druga decyzja: czy okazja dotyczy gry obecnej na liście obserwowanych danego użytkownika, przy czym wskazanie platformy przy pozycji zawęża trafienia do tej platformy, a jego brak dopuszcza wszystkie. Rekord zawiera grę, platformę, cenę oraz — jeśli wpis je podaje — datę wygaśnięcia i procentową zniżkę.

Odrębna reguła dotyczy odnośnika do zakupu: preferowany jest odnośnik prowadzący wprost do sklepu, z którego okazja pochodzi; gdy w treści wpisu go nie ma — bo bywa dostępny wyłącznie jako przycisk w agregatorze albo został usunięty z kanału — używany jest odnośnik do samego wpisu w agregatorze. Użytkownik spotyka wynik w jednym widoku okazji: każdy wiersz to jedna oferta na grę z jego listy, z ceną, zniżką gdy jest znana, i odnośnikiem, który zawsze prowadzi do miejsca, z którego okazja pochodzi.

## Access Control

Rejestracja i logowanie parą e-mail + hasło. Każdy użytkownik zakłada własne konto; lista obserwowanych i dopasowane do niej okazje należą wyłącznie do niego i nie są widoczne dla innych użytkowników.

Płaski model ról — wszyscy zalogowani użytkownicy mają te same uprawnienia. Brak panelu administracyjnego w MVP: lista źródeł i reguły przetwarzania są konfigurowane poza aplikacją, nie przez interfejs.

## Non-Goals

- **Produkt nie odpytuje sklepów o ceny ani dostępność.** Jedynym wejściem są wpisy publikowane przez ludzi w agregatorach; cena pochodzi z treści wpisu i nie jest weryfikowana u źródła. Przesądza, skąd bierze się cała treść produktu.
- **Produkt nie identyfikuje konkretnego wydania gry.** Rozpoznawana jest gra, nie jej wydanie — bez rozróżniania edycji, regionu ani konkretnego zestawu w pudełku. Identyfikacja służy dopasowaniu oferty do obserwowanego tytułu, nie katalogowaniu kolekcji.
- **Produkt nie ocenia, czy cena jest dobra.** Pokazywana jest cena i procentowa zniżka podana we wpisie; własna ocena okazji nie powstaje. Najniższa widziana cena wraca do rozważenia dopiero, gdy uzbiera się historia z kilku tygodni zbierania.
- **Produkt nie wysyła powiadomień.** Brak wiadomości e-mail i powiadomień wypychanych — użytkownik sam otwiera aplikację. Świadomie pozostawia niezaadresowaną warstwę ulotności okazji, wskazaną wcześniej jako jedna z trzech warstw bólu.
- **Produkt nie obiecuje kompletności.** Nie ma zobowiązania, że każda istniejąca okazja na grę z listy obserwowanych zostanie pokazana; część wpisów zostanie zrozumiana błędnie albo w ogóle nie trafi do źródła. Wykluczenie jakościowe, nie funkcjonalne.

## Open Questions

1. **Nazwa produktu** — nierozstrzygnięta świadomie; użytkownik odłożył decyzję jako nieistotną na tym etapie. Owner: użytkownik. Block: nie (PRD wpisze placeholder).
2. **Zakres potoku w v1: zbieranie kontra przetwarzanie** — czy pierwsza wersja zbiera surowe wpisy z trzech źródeł, ale przez normalizację przepuszcza tylko jedno, czy normalizuje wszystko, co zebrane. Różnica przekłada się wprost na koszt strojenia ekstrakcji i na problem duplikatów tej samej okazji między źródłami. Owner: użytkownik. Do rozstrzygnięcia po pierwszym działającym przebiegu ekstrakcji na realnych wpisach.
3. **Próg czystości listy** — użytkownik uznał czystość listy za zobowiązanie v1, ale nie zadeklarował dopuszczalnego udziału pozycji nienależących (wersje cyfrowe, oferty na niewłaściwą grę). Bez progu nie da się stwierdzić, czy filtr działa. Owner: użytkownik. Do rozstrzygnięcia po obejrzeniu wyników pierwszej ekstrakcji.
4. **Wolumen danych** — nieokreślony. Zbieranie działa w sposób ciągły z n źródeł, więc zbiór surowych wpisów rośnie liniowo w czasie niezależnie od liczby użytkowników. Owner: użytkownik. Wpływa na krok wyboru stacku.
5. **Mierzalne kryterium sukcesu głównego** — kryteria z sekcji Success Criteria są sformułowane binarnie (przepływ działa albo nie). Nie ustalono wartości liczbowej, po której uznasz, że dopasowanie działa wystarczająco dobrze (np. ile trafień na listę obserwowanych w pierwszym tygodniu). Owner: użytkownik. Block: nie.
6. **Zachowanie przy niedostępnym katalogu** — co widzi użytkownik, gdy katalog gier nie odpowiada w momencie wyszukiwania. Po wciągnięciu katalogu do v1 jest to jedyna zewnętrzna zależność stojąca na głównej ścieżce dodawania gry. Owner: użytkownik. Do rozstrzygnięcia przed implementacją FR-003.
7. **Pokrycie katalogu dla polskiego rynku** — nie sprawdzono, jak dobrze wybrany katalog zna tytuły istotne dla kolekcjonera wydań pudełkowych w Polsce. Decyzja „tylko pozycje z katalogu" czyni to pokrycie górną granicą użyteczności produktu. Owner: użytkownik. Najtańszy sposób sprawdzenia: kilka zapytań o realne tytuły z własnej listy, przed rozpoczęciem implementacji.

## Quality cross-check

Bramka jakości przebiegła bez luk — wszystkie sześć elementów obecnych (kontrola dostępu, jednozdaniowa reguła domenowa, artefakty projektu, akceptacja kosztu czasowego, nie-cele; zachowanie do utrzymania nie dotyczy projektu od zera). Status: `accepted`.

**Rewizja z 2026-09-16, po zamknięciu bramki.** Użytkownik wycofał jedno z cięć fazy 3: identyfikacja gry z zewnętrznego katalogu wchodzi do v1 jako must-have. Uzasadnienie: trzy kontrargumenty przyjęte w rundzie sokratejskiej miały wspólny korzeń w braku tożsamości gry. Konsekwencje zapisane w dokumencie: FR-008 scalone z FR-003 i podniesione do must-have, FR-009 dopisane jako nice-to-have, budżet 3 → 4 tygodnie z jawną akceptacją kosztu, termin „wishlista" zastąpiony przez „listę obserwowanych", dwa nowe pytania otwarte (#6, #7) dotyczące nowej zależności zewnętrznej.

Siedem pozycji z sekcji Open Questions to świadomie odłożone decyzje, nie luki bramki. Trzy blokują najwcześniej: zakres potoku w v1 (#2) decyduje o treści pierwszego tygodnia pracy, próg czystości listy (#3) o tym, kiedy filtr wolno uznać za działający, a pokrycie katalogu (#7) o tym, czy przyjęta właśnie zmiana w ogóle się opłaca.

## Domain constraint: ulotność źródła

Kanały RSS oddają treść z około dwóch ostatnich dni; wpisy starsze przepadają bezpowrotnie. Konsekwencja produktowa: historia okazji może istnieć wyłącznie od momentu, w którym zaczyna działać zbieranie. Im później startuje zbieranie, tym uboższa baza w dniu premiery produktu.

## Forward: tech-stack

Treści zebrane w trakcie shapingu, które NIE są częścią PRD — do przejęcia przez krok wyboru stacku:

- Użytkownik rozważa uruchomienie zbierania surowych wpisów już teraz, niezależnie od reszty projektu, cyklicznym zadaniem w GitHub Actions, z zapisem do surowego pliku JSON i późniejszym importem do właściwej bazy. Motywacja: dwudniowe okno RSS (patrz wyżej) — każdy tydzień zwłoki to bezpowrotnie utracone dane.
- Model przetwarzania w głowie użytkownika: zbieranie z n źródeł do wspólnej bazy surowej → dopiero potem normalizacja przez LLM z tej bazy. Etap zbierania jest generyczny i niezależny od źródła; etap przetwarzania jest tym, który kosztuje.
- Wybór konkretnego katalogu gier (dostawca, model licencyjny, limity zapytań, sposób uwierzytelnienia) należy do kroku wyboru stacku. PRD zna wyłącznie fakt produktowy: tożsamość gry pochodzi z zewnętrznego katalogu.
