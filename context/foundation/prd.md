---
project: "# TODO: project — see Open Questions"
version: 2
status: draft
created: 2026-09-16
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: null
timeline_budget:
  mvp_weeks: 4
  hard_deadline: 2026-11-04
  after_hours_only: true
---

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
- FR-004: Użytkownik może usunąć pozycję (grę albo frazę) ze swojej listy obserwowanych. Priority: must-have
  > Socrates: Kontrargument przyjęty: "razem z pozycją przepada informacja, że użytkownik kiedykolwiek ten tytuł śledził — a to ona byłaby podstawą późniejszej historii cen". Rozstrzygnięcie: usunięcie jest widoczne dla użytkownika jako trwałe (pozycja znika z jego widoku), ale ślad śledzenia pozostaje w danych i nie jest kasowany.
- FR-007: Użytkownik może oznaczyć grę z listy obserwowanych jako zakupioną. Priority: nice-to-have
  > Socrates: Kontrargument przyjęty (zgłoszony przez samego użytkownika): "przy wpisie tekstowym »zakupione« nie jest informacją o żadnej rzeczywistej grze". Rozstrzygnięcie po rewizji z 2026-09-16: blokada zniesiona — pozycja wskazuje teraz grę z katalogu, więc oznaczenie niesie realną informację. Priorytet pozostaje nice-to-have, bo samo w sobie nie jest potrzebne do przejścia głównego przepływu.
- FR-010: Użytkownik może dodać do listy obserwowanych frazę, opcjonalnie wskazując platformę; fraza pasuje do okazji, której którykolwiek tytuł ją zawiera, bez względu na wielkość liter, znaki diakrytyczne i interpunkcję. Priority: must-have
  > Rozstrzygnięte 2026-10-06 (pytanie 9 w `context/foundation/roadmap.md`): katalog nie zna części gier z wpisów, zwłaszcza nowych premier, więc obok gier z katalogu lista obserwowanych przyjmuje frazy. Przyjęty koszt opisuje Business Logic.

### Okazje
- FR-005: Użytkownik może zobaczyć okazje dopasowane do gier i fraz ze swojej listy obserwowanych, ograniczone do wersji fizycznych, z ceną oraz procentową zniżką, jeśli wpis źródłowy ją podaje. Priority: must-have
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
- Udział pozycji nienależących do listy (wersje cyfrowe, oferty na niewłaściwą grę) ma być ograniczony do 5% okazji na liście (rozstrzygnięte 2026-10-06 — patrz Open Questions).

## Business Logic

Z każdego wpisu pisanego przez człowieka powstaje ustrukturyzowana okazja — rozpoznana gra, platforma, cena, a jeśli wpis je zawiera: data wygaśnięcia i procentowa zniżka, wraz z odnośnikiem prowadzącym do sklepu, a gdy takiego w treści nie ma — do wpisu w agregatorze — która trafia przed oczy użytkownika wyłącznie wtedy, gdy dotyczy wersji fizycznej gry obecnej na jego liście obserwowanych albo pasującej do frazy z tej listy.

Reguła konsumuje dwa wejścia widoczne dla użytkownika: treść okazji opublikowaną przez innego człowieka, pozbawioną jednolitej struktury i pisaną za każdym razem inaczej, oraz listę obserwowanych — zbiór gier wybranych z katalogu i fraz, każda pozycja z opcjonalnie wskazaną platformą. Z pierwszego wejścia powstaje uporządkowany opis oferty, z drugiego — kryterium, według którego oferta zostaje pokazana albo odrzucona.

Gra na liście obserwowanych pochodzi z zewnętrznego katalogu gier, więc jej nazwa nie zależy od tego, co wpisze użytkownik. Okazja nie wskazuje pozycji katalogu — niesie tytuły, którymi posługuje się jej wpis źródłowy. Pozycja z grą pasuje do okazji, gdy nazwa gry z katalogu jest równa któremuś z tytułów okazji po pominięciu wielkości liter, znaków diakrytycznych, interpunkcji oraz słów oznaczających wydanie i platformę (rozstrzygnięte 2026-10-09 — patrz S-04 w `context/foundation/roadmap.md`). Takie dopasowanie identyfikuje **grę, nie konkretne wydanie** (patrz Non-Goals) — nie rozstrzyga, czy oferta dotyczy pudełka czy klucza, ani jakiego regionu dotyczy. Poza grami z katalogu lista obserwowanych przyjmuje frazy: pozycja z frazą pasuje do okazji, której którykolwiek tytuł zawiera tę frazę, bez względu na wielkość liter, znaki diakrytyczne i interpunkcję. Fraza nie ma tożsamości w katalogu, więc fraza z literówką po cichu nie pasuje do żadnej okazji — to przyjęty koszt obserwowania gier, których katalog nie zna (np. nowych premier), albo szerszych fraz (rozstrzygnięte 2026-10-06 — patrz pytanie 9 w `context/foundation/roadmap.md`).

Wyjściem reguły są dwie rozłączne decyzje odsiewające oraz jeden uporządkowany rekord. Pierwsza decyzja: czy okazja dotyczy wydania fizycznego — oferty na wersje cyfrowe i klucze są odrzucane, nawet gdy dotyczą gry z listy obserwowanych. Ta decyzja zapada wyłącznie na treści wpisu źródłowego, bo katalog jej nie rozstrzyga. Druga decyzja: czy okazja dotyczy gry albo frazy z listy obserwowanych danego użytkownika, przy czym wskazanie platformy przy pozycji — tak samo przy grze, jak i przy frazie — zawęża trafienia do tej platformy, a jego brak dopuszcza wszystkie. Rekord zawiera grę, platformę, cenę oraz — jeśli wpis je podaje — datę wygaśnięcia i procentową zniżkę.

Odrębna reguła dotyczy odnośnika do zakupu: preferowany jest odnośnik prowadzący wprost do sklepu, z którego okazja pochodzi; gdy w treści wpisu go nie ma — bo bywa dostępny wyłącznie jako przycisk w agregatorze albo został usunięty z kanału — używany jest odnośnik do samego wpisu w agregatorze. Użytkownik spotyka wynik w jednym widoku okazji: każdy wiersz to jedna oferta na grę z jego listy albo na grę pasującą do frazy z tej listy, z ceną, zniżką gdy jest znana, i odnośnikiem, który zawsze prowadzi do miejsca, z którego okazja pochodzi.

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

1. **Nazwa produktu** — nierozstrzygnięta świadomie; użytkownik odłożył decyzję jako nieistotną na tym etapie. Owner: użytkownik. Block: nie (frontmatter `project` niesie placeholder TODO do czasu rozstrzygnięcia).
2. **Zakres potoku w v1: zbieranie kontra przetwarzanie** — czy pierwsza wersja zbiera surowe wpisy z trzech źródeł, ale przez normalizację przepuszcza tylko jedno, czy normalizuje wszystko, co zebrane. Różnica przekłada się wprost na koszt strojenia ekstrakcji i na problem duplikatów tej samej okazji między źródłami. Owner: użytkownik. Do rozstrzygnięcia po pierwszym działającym przebiegu ekstrakcji na realnych wpisach. **Rozstrzygnięte 2026-10-06:** v1 normalizuje wpisy ze wszystkich trzech agregatorów. Ekstrakcja kosztuje ok. $0,0002 za wpis, a ta sama okazja z dwóch źródeł dotyczy 48 z 868 gier na liście (ok. 5,5%). Takie okazje zostają osobnymi kartami; ich łączenie nie wchodzi do v1 (`context/changes/physical-deals-from-real-posts/review.md`).
3. **Próg czystości listy** — użytkownik uznał czystość listy za zobowiązanie v1, ale nie zadeklarował dopuszczalnego udziału pozycji nienależących (wersje cyfrowe, oferty na niewłaściwą grę). Bez progu nie da się stwierdzić, czy filtr działa. Owner: użytkownik. Do rozstrzygnięcia po obejrzeniu wyników pierwszej ekstrakcji. **Rozstrzygnięte 2026-10-06:** dopuszczalne jest do 5% pozycji nienależących wśród okazji na liście. Pierwsza losowa próbka (100 wpisów, 68 okazji na liście) dała 2,9%: dwie okazje z ceną zestawu dwóch gier i ani jednej wersji cyfrowej (`review.md`).
4. **Wolumen danych** — nieokreślony; frontmatter `target_scale.data_volume` pozostaje pusty. Zbieranie działa w sposób ciągły z n źródeł, więc zbiór surowych wpisów rośnie liniowo w czasie niezależnie od liczby użytkowników. Owner: użytkownik. Wpływa na krok wyboru stacku.
5. **Mierzalne kryterium sukcesu głównego** — kryteria z sekcji Success Criteria są sformułowane binarnie (przepływ działa albo nie). Nie ustalono wartości liczbowej, po której uznasz, że dopasowanie działa wystarczająco dobrze (np. ile trafień na listę obserwowanych w pierwszym tygodniu). Owner: użytkownik. Block: nie. **Rozstrzygnięte 2026-10-09:** dopasowanie działa wystarczająco dobrze, gdy co najmniej 80% okazji na obserwowane gry trafia do widoku okazji, a co najwyżej 5% okazji w tym widoku dotyczy innej gry. Próg mierzy odbiór S-04 na produkcji.
6. **Zachowanie przy niedostępnym katalogu** — co widzi użytkownik, gdy katalog gier nie odpowiada w momencie wyszukiwania. Po wciągnięciu katalogu do v1 jest to jedyna zewnętrzna zależność stojąca na głównej ścieżce dodawania gry. Owner: użytkownik. Do rozstrzygnięcia przed implementacją FR-003. **Rozstrzygnięte 2026-10-06:** niezależnie od przyczyny awarii użytkownik widzi jeden ogólny komunikat, że katalog jest chwilowo niedostępny. Lista obserwowanych działa dalej, a wpisany tekst nadal można obserwować jako frazę.
7. **Pokrycie katalogu dla polskiego rynku** — nie sprawdzono, jak dobrze wybrany katalog zna tytuły istotne dla kolekcjonera wydań pudełkowych w Polsce. Decyzja „tylko pozycje z katalogu" czyni to pokrycie górną granicą użyteczności produktu. Owner: użytkownik. Najtańszy sposób sprawdzenia: kilka zapytań o realne tytuły z własnej listy, przed rozpoczęciem implementacji. **Rozstrzygnięte 2026-09-26:** PASS. Wszystkie 12 tytułów z listy użytkownika znalazły się w pierwszych pięciu wynikach katalogu, a obie sprawdzone polskie nazwy („Wiedźmin 3: Dziki Gon", „Dziedzictwo Hogwartu") trafiły na pierwsze miejsce (`context/changes/game-catalog-provider-proven/coverage.md`).
