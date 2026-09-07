/* ===========================================================================
   italiano.js — the language layer.

   PHRASES      situational phrases for a technical interview, grouped.
   IT_CHAPTERS  keyed by chapter id: one or two things you would actually SAY
                about that topic, plus the terms that KEEP their English.

   COVERAGE IS DELIBERATELY PARTIAL. There is an entry for the chapters where
   there is something genuinely useful to say; the panel simply does not appear
   elsewhere. A half-written translation teaches a sentence you would not want
   to say in a room, which is worse than teaching nothing.

   The English technical nouns stay English on purpose — la query, il deploy,
   fare il merge, l'indice. That is how the language is actually used in this
   industry, and translating them marks somebody who learned it from a textbook.
   =========================================================================== */

window.PHRASES = [
  {
    group: "Aprire — opening",
    lines: [
      { it: "Buongiorno, piacere di conoscerla.", en: "Good morning, pleased to meet you.",
        note: "Lei (formal) throughout a first interview, unless they switch to tu first — and they usually will." },
      { it: "Grazie per il tempo che mi dedica.", en: "Thank you for your time." },
      { it: "Mi parli di lei. → Certo. Vengo da…, negli ultimi due anni mi sono concentrato sui database…",
        en: "Tell me about yourself. → Of course. My background is…, for the last two years I have focused on databases…",
        note: "Ninety seconds: where you are, what you can do with ONE example, why here. Chapter 51." },
      { it: "Ho letto l'annuncio con attenzione: la parte di ottimizzazione è quella che mi interessa di più.",
        en: "I read the advert carefully: the optimisation part is what interests me most.",
        note: "Quoting their advert back is cheap and it lands." },
    ],
  },
  {
    group: "Prendere tempo — buying time",
    lines: [
      { it: "Mi lasci ragionare un attimo.", en: "Let me think for a moment.",
        note: "Completely normal. Silence while thinking is fine; silence while panicking is what you are avoiding." },
      { it: "Se ho capito bene, vuole sapere…", en: "If I understand correctly, you want to know…",
        note: "Restating the question is the single most useful habit in a technical round." },
      { it: "Posso farle una domanda sui dati prima di rispondere?", en: "May I ask a question about the data before I answer?",
        note: "Asking about nulls, ties or volumes is a senior behaviour and is being watched for." },
      { it: "Ragiono ad alta voce, se per lei va bene.", en: "I will think out loud, if that is all right.",
        note: "Say this once and then do it. An interviewer cannot mark silence." },
    ],
  },
  {
    group: "Ammettere un limite — admitting a gap",
    lines: [
      { it: "No, non l'ho mai fatto in produzione. Conosco i concetti — modelli di recovery, RPO e RTO — ma non ho mai fatto un restore sotto pressione.",
        en: "No, I have never done that in production. I know the concepts — recovery models, RPO and RTO — but I have never done a restore under pressure.",
        note: "Own it, bound it, bridge it. The precision is what makes it credible." },
      { it: "Non lo so con certezza. La mia ipotesi sarebbe…, perché…, ma verificherei prima di dare per scontato.",
        en: "I do not know for certain. My guess would be…, because…, but I would check before relying on it.",
        note: "A reasoned guess, labelled as one, beats silence and beats bluffing." },
      { it: "Questa parte non l'ho ancora affrontata. Come me la spiegherebbe?",
        en: "I have not covered that yet. How would you explain it?",
        note: "Turning a gap into a conversation. It works better than people expect." },
    ],
  },
  {
    group: "Non essere d'accordo — disagreeing politely",
    lines: [
      { it: "Sono d'accordo sull'obiettivo. Il mio dubbio è che la migrazione blocchi la tabella ordini in orario di punta.",
        en: "I agree with the goal. My concern is that the migration would lock the orders table at peak time.",
        note: "Agree with the goal, name the specific risk. Never start with “no”." },
      { it: "Potremmo farlo in batch, così non tiene mai un lock lungo. Serve un giorno in più.",
        en: "We could do it in batches, so it never holds a long lock. It costs one extra day.",
        note: "Always bring the alternative and its cost." },
      { it: "Va bene, procedo così. Lascio una nota sul ticket con il rischio.",
        en: "All right, I will do it that way. I will note the risk on the ticket.",
        note: "Say it once, note it in writing, then execute properly. Chapter 48." },
    ],
  },
  {
    group: "Spiegare un problema — explaining a problem",
    lines: [
      { it: "Il report conta due volte gli ordini che hanno più di un pagamento.",
        en: "The report counts orders with more than one payment twice.",
        note: "Consequence first, in their words. Never “there is a fan-out in the join”." },
      { it: "La query legge tutti gli ordini invece di andare direttamente a quelli richiesti.",
        en: "The query reads every order instead of going straight to the ones you asked for.",
        note: "How to say “table scan” to somebody who does not write SQL." },
      { it: "Possiamo calcolarlo di notte invece che ogni volta: il report si apre subito ed è aggiornato a stamattina.",
        en: "We can calculate it overnight instead of each time: the report opens instantly and is current as of this morning.",
        note: "How to propose a summary table without saying “denormalise”." },
      { it: "Ti aggiorno appena ho capito la causa — al momento sto confrontando i due totali per mese.",
        en: "I will update you as soon as I understand the cause — right now I am comparing the two totals by month.",
        note: "Saying what you are doing, not just that you are working on it." },
    ],
  },
  {
    group: "Chiedere aiuto — asking for help",
    lines: [
      { it: "Sto cercando di far quadrare la riconciliazione di magazzino. Ho già confrontato per mese e per deposito: il WH-03 è fuori di 412 pezzi. Sono fermo lì. Hai dieci minuti?",
        en: "I am trying to make the stock reconciliation balance. I have already compared by month and by warehouse: WH-03 is out by 412 units. That is where I am stuck. Do you have ten minutes?",
        note: "Goal, tried, stuck, ask. Four lines, one minute of their time. Chapter 48." },
      { it: "Sono fermo su questo da mezz'ora, preferisco chiedere.",
        en: "I have been stuck on this for half an hour, I would rather ask.",
        note: "Twenty to forty minutes is the right window. Three days is not." },
    ],
  },
  {
    group: "Il lavoro quotidiano — the daily rhythm",
    lines: [
      { it: "Ieri ho chiuso la 412: la differenza erano gli ordini annullati contati in un report e non nell'altro. Oggi passo alla 415. Nessun blocco.",
        en: "Yesterday I closed 412: the difference was cancelled orders counted in one report and not the other. Today I move to 415. No blockers.",
        note: "The whole stand-up, in twelve seconds. Outcome, cause, next, blocker." },
      { it: "La prendo in carico io.", en: "I will take it on." },
      { it: "È in lavorazione, conto di chiuderla entro domani.", en: "It is in progress, I expect to close it by tomorrow." },
      { it: "Non ce la faccio per giovedì. Servono due giorni in più, oppure posso rilasciare solo per una regione. Cosa preferisci?",
        en: "I will not make Thursday. I need two more days, or I can release for one region only. Which would you prefer?",
        note: "Early, specific, with an option. Chapter 47." },
      { it: "Va in collaudo domani, e se il cliente approva andiamo in produzione lunedì.",
        en: "It goes to acceptance testing tomorrow, and if the client approves we go live on Monday.",
        note: "collaudo and avvio in produzione are two of the few genuinely Italian technical words." },
    ],
  },
  {
    group: "Domande per loro — questions to ask",
    lines: [
      { it: "Come arrivano le modifiche allo schema in produzione? Le migrazioni sono versionate?",
        en: "How do schema changes reach production? Are migrations versioned?",
        note: "A real question that is also a signal. The answer tells you a great deal, instantly." },
      { it: "Avete una prova di restore periodica? Quando è stata fatta l'ultima?",
        en: "Do you have a periodic restore drill? When was the last one?",
        note: "The pause before the answer is itself information." },
      { it: "Chi è il proprietario del database? C'è un DBA o è condiviso dal team?",
        en: "Who owns the database? Is there a DBA or is it shared by the team?" },
      { it: "Com'è il primo mese? Su cosa lavorerei?",
        en: "What does the first month look like? What would I be working on?" },
      { it: "Cosa vi farebbe dire, fra sei mesi, che questa assunzione è andata bene?",
        en: "What would make you say, in six months, that this hire went well?",
        note: "Ask it last. It reframes the whole conversation and people remember it." },
    ],
  },
  {
    group: "Soldi e contratto — money and the contract",
    lines: [
      { it: "La mia aspettativa è nella fascia 28–32k di RAL, in base al ruolo complessivo. Qual è il range previsto per questa posizione?",
        en: "My expectation is in the 28–32k RAL range, depending on the overall role. What is the budgeted range for this position?",
        note: "A range, a reason, and the question handed back. Refusing to name one reads as evasive here." },
      { it: "Quale CCNL si applica, e a che livello?", en: "Which national contract applies, and at what level?",
        note: "A normal, informed question. It sets the minimum, the notice period and the holidays." },
      { it: "È un contratto a tempo indeterminato o un apprendistato?",
        en: "Is it a permanent contract or an apprenticeship?",
        note: "Apprendistato is normal for a junior and converts to indeterminato. Understand it rather than fear it." },
      { it: "Sono previsti buoni pasto o welfare aziendale?", en: "Are meal vouchers or a welfare budget included?",
        note: "Often easier for them to move than RAL." },
      { it: "Posso avere l'offerta per iscritto? Vorrei rileggerla con calma e le do una risposta domani.",
        en: "Could I have the offer in writing? I would like to reread it and give you an answer tomorrow.",
        note: "Nobody withdraws an offer because you asked for a day." },
    ],
  },
  {
    group: "Chiudere — closing",
    lines: [
      { it: "La ringrazio, è stato molto utile. Resto a disposizione.",
        en: "Thank you, that was very useful. I remain available." },
      { it: "Quali sono i prossimi passi, e in che tempi?", en: "What are the next steps, and on what timescale?",
        note: "Always ask. It costs nothing and it tells you when to follow up." },
    ],
  },
];

/* --------------------------------------------------------------------------
   Per-chapter panels. `say` is what you would actually say about that topic in
   an Italian technical interview; `keep` lists the terms that stay English.
   -------------------------------------------------------------------------- */

window.IT_CHAPTERS = {

  /* ---- Part 0. The vocabulary a beginner needs before anything else, and
     the handful of sentences that come up in a first interview when the
     candidate is honest about being early in the subject. ---------------- */

  "00a-what-is-a-database": {
    say: [
      { it: "Un database serve quando più persone scrivono insieme e una modifica non può restare a metà.",
        en: "A database is what you need when several people write at once and a change cannot be left half-applied.",
        note: "The honest answer to “why not Excel”, and it is the one that sounds like experience." },
      { it: "SQL è dichiarativo: descrivi il risultato che vuoi, non i passaggi per ottenerlo.",
        en: "SQL is declarative: you describe the result you want, not the steps to get it." },
    ],
    keep: ["database", "engine", "query", "SQL", "client"],
  },
  "00b-run-your-first-query": {
    say: [
      { it: "In locale uso SQLite o un container Docker: così provo tutto senza toccare niente di condiviso.",
        en: "Locally I use SQLite or a Docker container, so I can try things without touching anything shared.",
        note: "Says “I experiment” and “I am careful” in one sentence." },
      { it: "Il client è quello dove scrivo, il motore è quello che esegue: sono due cose diverse.",
        en: "The client is where I type; the engine is what executes. They are two different things." },
    ],
    keep: ["client", "engine", "container", "Docker", "SSMS"],
  },
  "00c-tables-rows-columns": {
    say: [
      { it: "Ogni tabella ha una chiave primaria, altrimenti due righe identiche non si distinguono.",
        en: "Every table has a primary key, otherwise two identical rows cannot be told apart." },
      { it: "La chiave surrogata identifica, la chiave naturale descrive: metto un vincolo UNIQUE sulla seconda.",
        en: "A surrogate key identifies, a natural key describes: I put a UNIQUE constraint on the second.",
        note: "This is the answer to the most common modelling question asked of a junior." },
    ],
    keep: ["primary key", "foreign key", "UNIQUE", "NULL", "record"],
  },
  "00d-select-and-from": {
    say: [
      { it: "Evito SELECT * nel codice che resta: se domani aggiungono una colonna, la query cambia da sola.",
        en: "I avoid SELECT * in code that stays: if a column is added tomorrow, the query changes by itself." },
      { it: "Gli apici singoli sono per il testo, i doppi per i nomi di colonna.",
        en: "Single quotes are for text, double quotes for column names." },
    ],
    keep: ["SELECT", "FROM", "alias", "SELECT *"],
  },
  "00e-where-filtering": {
    say: [
      { it: "Per cercare un giorno uso un intervallo mezzo aperto, non BETWEEN: così è giusto a qualsiasi precisione.",
        en: "To filter a day I use a half-open range rather than BETWEEN: it is correct at any precision." },
      { it: "Con NULL non si usa l'uguale: si usa IS NULL, altrimenti non torna niente e nessuno se ne accorge.",
        en: "You cannot use equals with NULL: you use IS NULL, otherwise nothing comes back and nobody notices.",
        note: "“Nessuno se ne accorge” — nobody notices — is the part that makes it sound like experience." },
    ],
    keep: ["WHERE", "NULL", "IS NULL", "LIKE", "sargable"],
  },
  "00f-order-by-and-limit": {
    say: [
      { it: "Senza ORDER BY l'ordine non è garantito, nemmeno se sembra stabile.",
        en: "Without ORDER BY the order is not guaranteed, even when it looks stable." },
      { it: "Quando pagino aggiungo sempre la chiave primaria all'ORDER BY, per rompere i pareggi.",
        en: "When I paginate I always add the primary key to the ORDER BY, to break ties.",
        note: "Saying this unprompted is one of the strongest small signals there is." },
    ],
    keep: ["ORDER BY", "LIMIT", "TOP", "OFFSET", "tie-breaker"],
  },
  "00g-expressions-and-types": {
    say: [
      { it: "Attenzione alla divisione fra interi: totale_centesimi / 100 tronca, servono i decimali.",
        en: "Watch out for integer division: total_cents / 100 truncates, you need decimals." },
      { it: "I soldi non si mettono mai in un float: DECIMAL, oppure interi in centesimi.",
        en: "Money never goes in a float: DECIMAL, or integers in cents." },
    ],
    keep: ["CAST", "DECIMAL", "float", "literal", "COALESCE"],
  },
  "00h-create-insert-update-delete": {
    say: [
      { it: "Prima di una DELETE faccio la SELECT con lo stesso WHERE, e la lancio dentro una transazione.",
        en: "Before a DELETE I run the SELECT with the same WHERE, and I run it inside a transaction.",
        note: "The habit an interviewer is listening for. Two clauses, and it answers the whole question." },
      { it: "Elenco sempre le colonne nella INSERT: senza, basta una colonna nuova e si rompe tutto.",
        en: "I always list the columns in an INSERT: without them, one new column breaks everything." },
    ],
    keep: ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "rollback"],
  },
  "00i-your-first-join": {
    say: [
      { it: "Se la condizione fa parte dell'abbinamento va nell'ON; se filtra il risultato va nel WHERE.",
        en: "If the condition is part of the match it goes in ON; if it filters the result it goes in WHERE.",
        note: "The one-sentence answer to the most common LEFT JOIN bug." },
      { it: "Con la LEFT JOIN le colonne di destra diventano NULL dove non c'è corrispondenza.",
        en: "With a LEFT JOIN the right-hand columns become NULL where there is no match." },
    ],
    keep: ["JOIN", "LEFT JOIN", "ON", "foreign key"],
  },
  "00j-your-first-group-by": {
    say: [
      { it: "WHERE filtra le righe prima del raggruppamento, HAVING filtra i gruppi dopo.",
        en: "WHERE filters rows before grouping, HAVING filters groups afterwards." },
      { it: "COUNT(*) conta le righe, COUNT(colonna) conta i valori non nulli: con una LEFT JOIN fa la differenza.",
        en: "COUNT(*) counts rows, COUNT(column) counts non-null values: across a LEFT JOIN that is the difference." },
    ],
    keep: ["GROUP BY", "HAVING", "COUNT", "aggregate"],
  },

  "01-engines-and-storage": {
    say: [
      { it: "Il commit aspetta che il log arrivi su disco, non le pagine dati: per questo è veloce.",
        en: "A commit waits for the log to reach disk, not the data pages: that is why it is fast." },
      { it: "Se la buffer pool non contiene il working set, ogni query paga letture fisiche.",
        en: "If the buffer pool does not hold the working set, every query pays physical reads." },
    ],
    keep: ["buffer pool", "commit", "log", "checkpoint", "page"],
  },
  "02-relational-model": {
    say: [
      { it: "Senza ORDER BY non esiste un ordine: quello che vedi è un caso, e cambia col piano.",
        en: "Without ORDER BY there is no order: what you see is an accident, and it changes with the plan." },
      { it: "Userei una chiave surrogata come primaria e un vincolo di unicità sulla chiave naturale.",
        en: "I would use a surrogate primary key plus a unique constraint on the natural key." },
    ],
    keep: ["ORDER BY", "primary key", "unique", "NULL"],
  },
  "03-data-types": {
    say: [
      { it: "Per gli importi non uso mai float: DECIMAL, oppure interi in centesimi.",
        en: "I never use float for amounts: DECIMAL, or integers in cents." },
      { it: "Gli istanti li salvo in UTC e converto solo quando li mostro.",
        en: "I store instants in UTC and convert only when displaying." },
    ],
    keep: ["float", "DECIMAL", "UTC", "timestamp", "collation"],
  },
  "04-ddl-and-constraints": {
    say: [
      { it: "I vincoli valgono per chiunque scriva: l'applicazione, il job notturno, la patch fatta di fretta.",
        en: "Constraints hold for whoever writes: the application, the nightly job, the rushed hotfix." },
      { it: "Attenzione: la foreign key non crea l'indice sulla colonna figlia. Va aggiunto a mano.",
        en: "Careful: a foreign key does not create the index on the child column. You add it yourself." },
    ],
    keep: ["constraint", "foreign key", "CHECK", "cascade"],
  },
  "05-normalisation": {
    say: [
      { it: "Punto alla terza forma normale, e denormalizzo solo dopo aver misurato — dicendo come tengo allineata la copia.",
        en: "I aim for 3NF, and denormalise only after measuring — saying how I keep the copy in step." },
      { it: "Il prezzo sulla riga d'ordine non è ridondanza: è il prezzo applicato quel giorno.",
        en: "The price on the order line is not redundancy: it is the price charged that day." },
    ],
    keep: ["3NF", "denormalizzare"],
  },
  "06-how-select-is-evaluated": {
    say: [
      { it: "L'ordine logico è FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY: per questo l'alias non si può usare nel WHERE.",
        en: "The logical order is FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY: that is why an alias cannot be used in WHERE." },
    ],
    keep: ["FROM", "WHERE", "GROUP BY", "HAVING", "alias"],
  },
  "07-predicates-and-sargability": {
    say: [
      { it: "Se metti una funzione sulla colonna, l'indice non si può usare: meglio un intervallo.",
        en: "If you wrap the column in a function the index cannot be used: use a range instead." },
      { it: "Attenzione alla conversione implicita: la query è corretta, solo cento volte più lenta.",
        en: "Watch for implicit conversion: the query is correct, merely a hundred times slower." },
    ],
    keep: ["sargable", "index", "seek", "scan", "cast"],
  },
  "08-joins": {
    say: [
      { it: "Uso NOT EXISTS, non NOT IN: basta un NULL nella subquery e non torna niente.",
        en: "I use NOT EXISTS, not NOT IN: one NULL in the subquery and it returns nothing." },
      { it: "I totali sono triplicati perché la join moltiplica le righe: aggrego prima ogni ramo.",
        en: "The totals are tripled because the join multiplies rows: I aggregate each branch first." },
    ],
    keep: ["NOT EXISTS", "NOT IN", "LEFT JOIN", "ON", "DISTINCT"],
  },
  "09-null-and-three-valued-logic": {
    say: [
      { it: "NULL vuol dire sconosciuto, non vuoto: qualsiasi confronto dà UNKNOWN.",
        en: "NULL means unknown, not empty: any comparison yields UNKNOWN." },
      { it: "COUNT(*) conta le righe, COUNT(colonna) conta i valori non nulli.",
        en: "COUNT(*) counts rows, COUNT(column) counts non-null values." },
    ],
    keep: ["NULL", "IS NULL", "COALESCE", "COUNT"],
  },
  "10-aggregation": {
    say: [
      { it: "WHERE filtra le righe prima del raggruppamento, HAVING filtra i gruppi dopo.",
        en: "WHERE filters rows before grouping, HAVING filters groups after." },
      { it: "Con l'aggregazione condizionale rispondo a tre domande in una sola scansione.",
        en: "With conditional aggregation I answer three questions in a single scan." },
    ],
    keep: ["GROUP BY", "HAVING", "CASE", "COUNT DISTINCT"],
  },
  "12-ctes-and-recursion": {
    say: [
      { it: "Metto un limite di profondità: i dati gerarchici reali contengono cicli.",
        en: "I put a depth guard in: real hierarchy data contains cycles." },
    ],
    keep: ["CTE", "WITH RECURSIVE", "UNION ALL"],
  },
  "13-window-functions": {
    say: [
      { it: "ROW_NUMBER dà numeri distinti, RANK salta dopo un pari merito, DENSE_RANK no.",
        en: "ROW_NUMBER gives distinct numbers, RANK skips after a tie, DENSE_RANK does not." },
      { it: "Serve un livello esterno: nel WHERE la window function non esiste ancora.",
        en: "You need an outer level: in WHERE the window function does not exist yet." },
    ],
    keep: ["window function", "OVER", "PARTITION BY", "ROW_NUMBER"],
  },
  "16-case-and-pivot": {
    say: [
      { it: "Il pivot lo faccio con l'aggregazione condizionale: è portabile e regge più aggregati.",
        en: "I pivot with conditional aggregation: it is portable and supports several aggregates." },
      { it: "Se le colonne devono essere dinamiche, di solito è meglio che sia il tool di reportistica a fare il pivot.",
        en: "If the columns must be dynamic, it is usually better to let the reporting tool pivot." },
    ],
    keep: ["CASE", "PIVOT", "NULLIF", "COALESCE"],
  },
  "17-strings-dates-timezones": {
    say: [
      { it: "Uso intervalli semiaperti: maggiore-uguale l'inizio, minore l'inizio del periodo dopo.",
        en: "I use half-open ranges: greater-or-equal the start, less than the next start." },
      { it: "L'ora locale è ambigua per un'ora ogni autunno, e non si recupera più.",
        en: "Local time is ambiguous for one hour every autumn, and it cannot be recovered." },
    ],
    keep: ["UTC", "timestamp", "collation", "BETWEEN"],
  },
  "19-insert-update-delete": {
    say: [
      { it: "Prima scrivo la SELECT e conto le righe, poi la trasformo in DELETE dentro una transazione.",
        en: "First I write the SELECT and count the rows, then turn it into a DELETE inside a transaction." },
    ],
    keep: ["SELECT", "DELETE", "TRUNCATE", "commit", "rollback"],
  },
  "20-upsert-and-idempotency": {
    say: [
      { it: "Il carico dev'essere idempotente: se il job rifà lo stesso lavoro non deve duplicare niente.",
        en: "The load must be idempotent: if the job repeats the same work it must not duplicate anything." },
      { it: "Il vincolo di unicità è quello che rende sicuro l'upsert, non la sintassi.",
        en: "The unique constraint is what makes the upsert safe, not the syntax." },
    ],
    keep: ["upsert", "MERGE", "ON CONFLICT", "idempotente"],
  },
  "21-transactions": {
    say: [
      { it: "Non tengo mai una transazione aperta durante una chiamata esterna.",
        en: "I never hold a transaction open across an external call." },
    ],
    keep: ["transazione", "commit", "rollback", "ACID", "savepoint"],
  },
  "22-isolation-levels": {
    say: [
      { it: "Il lost update capita al livello di isolamento predefinito e non dà nessun errore.",
        en: "Lost update happens at the default isolation level and produces no error at all." },
      { it: "Se i lettori bloccano gli scrittori, la soluzione è READ_COMMITTED_SNAPSHOT, non il NOLOCK.",
        en: "If readers block writers, the fix is READ_COMMITTED_SNAPSHOT, not NOLOCK." },
    ],
    keep: ["isolation level", "NOLOCK", "snapshot", "MVCC"],
  },
  "23-locks-and-deadlocks": {
    say: [
      { it: "Un deadlock non è un bug del database: sono due transazioni che prendono i lock in ordine diverso.",
        en: "A deadlock is not a database bug: it is two transactions taking locks in a different order." },
      { it: "Dieci milioni di righe le aggiorno a blocchi, così i lock non fanno escalation.",
        en: "I update ten million rows in batches, so the locks do not escalate." },
    ],
    keep: ["deadlock", "lock", "escalation", "batch", "retry"],
  },
  "24-concurrency-patterns": {
    say: [
      { it: "Concorrenza ottimistica: colonna version, e zero righe aggiornate vuol dire conflitto.",
        en: "Optimistic concurrency: a version column, and zero rows updated means a conflict." },
      { it: "L'outbox mette il messaggio nella stessa transazione del dato: consegna at-least-once, quindi il consumer dev'essere idempotente.",
        en: "The outbox puts the message in the same transaction as the data: at-least-once delivery, so the consumer must be idempotent." },
    ],
    keep: ["outbox", "SKIP LOCKED", "version", "at-least-once"],
  },
  "25-how-an-index-works": {
    say: [
      { it: "Un seek costa tre o quattro letture di pagina, che la tabella abbia mille righe o un miliardo.",
        en: "A seek costs three or four page reads, whether the table has a thousand rows or a billion." },
    ],
    keep: ["index", "seek", "scan", "clustered", "lookup"],
  },
  "26-index-design": {
    say: [
      { it: "Prima le colonne di uguaglianza, poi quella di intervallo: (a, b) non è (b, a).",
        en: "Equality columns first, then the range column: (a, b) is not (b, a)." },
    ],
    keep: ["covering", "INCLUDE", "composite", "selettività"],
  },
  "27-execution-plans": {
    say: [
      { it: "Guardo prima la differenza fra righe stimate e righe effettive: il resto è conseguenza.",
        en: "I look first at the gap between estimated and actual rows: the rest is a consequence." },
    ],
    keep: ["piano di esecuzione", "EXPLAIN", "hash join", "nested loops"],
  },
  "28-statistics-and-sniffing": {
    say: [
      { it: "Veloce per un cliente e lenta per un altro: è parameter sniffing.",
        en: "Fast for one customer and slow for another: that is parameter sniffing." },
      { it: "Lenta da dopo il carico notturno: sono le statistiche.",
        en: "Slow since the nightly load: that is statistics." },
    ],
    keep: ["statistiche", "parameter sniffing", "RECOMPILE", "plan cache"],
  },
  "29-slow-query-patterns": {
    say: [
      { it: "Prima controllo le solite dieci cose, poi apro il piano.",
        en: "First I check the usual ten things, then I open the plan." },
    ],
    keep: ["SELECT *", "cursor", "N+1", "OFFSET"],
  },
  "33-views-procs-functions-triggers": {
    say: [
      { it: "Una vista è un'interfaccia, non una cache: viene espansa nella query ogni volta.",
        en: "A view is an interface, not a cache: it is expanded into the query every time." },
      { it: "Un trigger scatta una volta per statement, non per riga.",
        en: "A trigger fires once per statement, not per row." },
    ],
    keep: ["vista", "stored procedure", "trigger", "funzione"],
  },
  "34-dynamic-sql-and-injection": {
    say: [
      { it: "I parametri non sono un escaping migliore: SQL e valori viaggiano su canali separati.",
        en: "Parameters are not better escaping: the SQL and the values travel on separate channels." },
    ],
    keep: ["SQL injection", "parametri", "sp_executesql", "allow-list"],
  },
  "35-security-and-gdpr": {
    say: [
      { it: "Account separati: uno per le migrazioni, uno per l'applicazione, uno per la reportistica.",
        en: "Separate accounts: one for migrations, one for the application, one for reporting." },
      { it: "Cancellazione e conservazione decennale si conciliano con la pseudonimizzazione.",
        en: "Erasure and ten-year retention are reconciled by pseudonymisation." },
    ],
    keep: ["GDPR", "least privilege", "row-level security", "pseudonimizzazione"],
  },
  "36-migrations": {
    say: [
      { it: "Migrazioni versionate, forward-only, e un lock timeout breve prima della DDL.",
        en: "Versioned migrations, forward-only, and a short lock timeout before the DDL." },
      { it: "Espando, riempio, aggiorno il codice, e solo alla fine tolgo la colonna vecchia.",
        en: "Expand, backfill, update the code, and only at the end drop the old column." },
    ],
    keep: ["migrazione", "lock timeout", "expand and contract", "backfill"],
  },
  "38-the-orm-boundary": {
    say: [
      { it: "L'ORM per le scritture, SQL scritto a mano per la reportistica.",
        en: "The ORM for writes, hand-written SQL for reporting." },
      { it: "Un N+1 si vede solo ordinando per numero di chiamate, non per durata media.",
        en: "An N+1 is only visible sorting by call count, not by average duration." },
    ],
    keep: ["ORM", "N+1", "eager loading", "lazy loading"],
  },
  "39-oltp-vs-olap": {
    say: [
      { it: "La prima decisione è la granularità: cosa rappresenta una riga della tabella dei fatti.",
        en: "The first decision is the grain: what one row of the fact table represents." },
      { it: "Le percentuali non si salvano: salvo numeratore e denominatore.",
        en: "I do not store percentages: I store the numerator and the denominator." },
    ],
    keep: ["star schema", "fact", "dimension", "grain", "SCD"],
  },
  "40-etl-and-warehouses": {
    say: [
      { it: "Il livello raw non si tocca mai: è la prova di cosa è arrivato.",
        en: "The raw layer is never modified: it is the evidence of what arrived." },
      { it: "Con un watermark stretto le righe in ritardo si perdono e nessuno se ne accorge.",
        en: "With a strict watermark, late rows are lost and nobody notices." },
    ],
    keep: ["ETL", "ELT", "staging", "watermark", "CDC", "SSIS"],
  },
  "41-backup-restore-ha": {
    say: [
      { it: "La replica non è un backup: replica fedelmente anche il DELETE sbagliato.",
        en: "A replica is not a backup: it faithfully replicates the mistaken DELETE too." },
      { it: "Un backup che non è mai stato ripristinato è un file su cui speriamo.",
        en: "A backup that has never been restored is a file we hope about." },
    ],
    keep: ["backup", "restore", "RPO", "RTO", "replica", "failover"],
  },
  "42-production-diagnosis": {
    say: [
      { it: "Prima domanda: è tutto lento o solo una cosa? Seconda: da quando, e cosa è cambiato?",
        en: "First question: is everything slow or one thing? Second: since when, and what changed?" },
      { it: "Cerco la testa della catena di blocco: chi blocca ed è bloccato da nessuno.",
        en: "I look for the head of the blocking chain: blocking others and blocked by nobody." },
    ],
    keep: ["wait statistics", "blocking chain", "baseline", "DMV"],
  },
  "44-dialects": {
    say: [
      { it: "Conosco a fondo SQL Server; leggo PL/SQL senza problemi ma non ho mai rilasciato un package.",
        en: "I know SQL Server deeply; I read PL/SQL comfortably but I have never shipped a package." },
      { it: "Circa l'85% è portabile: le differenze sono una tabella che si impara in una settimana.",
        en: "About 85% is portable: the differences are a lookup table you learn in a week." },
    ],
    keep: ["T-SQL", "PL/SQL", "dialetto"],
  },
  "46-italian-market": {
    say: [
      { it: "Il gestionale è installato dal cliente, quindi ogni modifica di schema deve valere su database che non vedo.",
        en: "The gestionale is installed at the customer, so every schema change must work on databases I cannot see." },
      { it: "La numerazione delle fatture dev'essere senza salti: è un problema di concorrenza vero.",
        en: "Invoice numbering must be gapless: it is a genuine concurrency problem." },
    ],
    keep: ["gestionale", "SDI", "fatturazione elettronica", "Power BI"],
  },
  "47-agile-and-rhythm": {
    say: [
      { it: "Alla refinement chiedo sempre: cosa succede alle righe già esistenti?",
        en: "At refinement I always ask: what happens to the rows that already exist?" },
    ],
    keep: ["daily", "sprint", "backlog", "refinement", "collaudo"],
  },
  "48-analysis-and-teamwork": {
    say: [
      { it: "Che numero si aspettava, e da dove l'ha preso?",
        en: "What number did you expect, and where did you get it from?" },
      { it: "Mi fa vedere una riga sbagliata in particolare?",
        en: "Can you show me one specific row that is wrong?" },
    ],
    keep: ["riconciliazione", "segnalazione", "analisi"],
  },
  "49-your-cv": {
    say: [
      { it: "Autorizzo il trattamento dei miei dati personali ai sensi del Reg. UE 2016/679.",
        en: "I authorise the processing of my personal data under EU Reg. 2016/679.",
        note: "The consent line. One line, at the bottom, in small print." },
      { it: "Inglese: B2 (letto e scritto C1).", en: "English: B2 (reading and writing C1).",
        note: "CEFR levels, never “buono”." },
    ],
    keep: ["CV", "CEFR", "GDPR", "LinkedIn"],
  },
  "51-the-interview": {
    say: [
      { it: "La mia aspettativa è nella fascia…, e qual è il range previsto per questa posizione?",
        en: "My expectation is in the … range, and what is the budgeted range for this position?" },
      { it: "Sì, ho due domande.", en: "Yes, I have two questions.",
        note: "Never “no, I think you covered everything”." },
    ],
    keep: ["RAL", "CCNL", "mensilità", "apprendistato", "preavviso"],
  },
};
