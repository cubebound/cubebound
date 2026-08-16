/**
 * Guards the drafted-deck export.
 *
 * The failure this exists for is silent: a list that looks perfectly reasonable
 * on screen and then fails to import, one line at a time, in someone else's
 * tool. Specifically, **our `cards.name` is not the name a builder expects for
 * every type** — champion units are stored as `Darius, Trifarian`, which is
 * right, but a legend stores only its title (`Daughter of the Void`) with the
 * champion in its own column. Export that as-is and every legend silently fails
 * to match.
 *
 * So the first half checks the naming rules against synthetic cards, and the
 * **second half checks them against the real pool**: every legend in the
 * database must produce a name containing its champion, and no card of any type
 * may produce a doubled champion. That is the part that would catch a future
 * set whose sync stores names a third way.
 *
 * It also round-trips through our own importer, which is a free correctness
 * check: the list we hand someone should be one we would accept back.
 *
 *   npm run check:deck-export
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

import { deckListName, toDeckList } from "../src/lib/deck-export";
import { previewImport } from "../src/lib/import-list";
import { getImportCatalog } from "../src/db/queries/cards";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false, max: 2 });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

try {
  // ---- the naming rules ------------------------------------------------
  expect(
    deckListName({ name: "Daughter of the Void", champion: "Kai'Sa", type: "Legend" }) ===
      "Kai'Sa, Daughter of the Void",
    "a legend must be exported as `Champion, Title` — its stored name is only the title",
  );
  // The guard that stops `Darius, Darius, Trifarian`.
  expect(
    deckListName({ name: "Darius, Trifarian", champion: "Darius", type: "Unit" }) ===
      "Darius, Trifarian",
    "a champion unit already carries its champion and must not have it added again",
  );
  expect(
    deckListName({ name: "Blazing Scorcher", champion: null, type: "Unit" }) ===
      "Blazing Scorcher",
    "an ordinary card exports under its own name",
  );
  // A non-legend with a champion is a signature spell or champion unit; the
  // champion belongs to the card's flavour, not to how a builder names it.
  expect(
    deckListName({ name: "Get Excited!", champion: "Jinx", type: "Spell" }) ===
      "Get Excited!",
    "a non-legend must not have its champion prepended",
  );

  // ---- copies aggregate, order is stable -------------------------------
  const list = toDeckList([
    { name: "Blazing Scorcher", champion: null, type: "Unit" },
    { name: "Blazing Scorcher", champion: null, type: "Unit" },
    { name: "Altar to Unity", champion: null, type: "Battlefield" },
    { name: "Daughter of the Void", champion: "Kai'Sa", type: "Legend" },
    { name: "Cleave", champion: null, type: "Spell" },
  ]);
  expect(
    list.text ===
      "1 Kai'Sa, Daughter of the Void\n2 Blazing Scorcher\n1 Cleave\n1 Altar to Unity",
    `unexpected list:\n${list.text}`,
  );
  expect(list.count === 5, `count should be copies, not lines: got ${list.count}`);
  expect(toDeckList([]).text === "", "an empty pool exports as an empty string");

  // ---- against the real card pool --------------------------------------
  const catalog = await getImportCatalog();

  const legends = catalog.filter((card) => card.type === "Legend");
  expect(legends.length > 0, "no legends in the catalog — the check is not testing anything");

  const missingChampion = legends.filter((card) => {
    const exported = deckListName(card);
    return card.champion ? !exported.includes(card.champion) : false;
  });
  expect(
    missingChampion.length === 0,
    `${missingChampion.length} legend(s) export without their champion, e.g. ` +
      `${missingChampion[0]?.name} -> ${missingChampion[0] && deckListName(missingChampion[0])}`,
  );

  // Nothing, of any type, may end up with the champion twice.
  const doubled = catalog.filter((card) => {
    const champion = card.champion?.trim();
    if (!champion) return false;
    const exported = deckListName(card).toLowerCase();
    return exported.split(champion.toLowerCase()).length > 2;
  });
  expect(
    doubled.length === 0,
    `${doubled.length} card(s) export with a doubled champion, e.g. ` +
      `${doubled[0] && deckListName(doubled[0])}`,
  );

  // ---- promo variants resolve to a card that actually exists -----------
  // `Battle Mistress (Metal)` must export as a name a builder knows. The
  // assertion is against the pool rather than a list of suffixes, so a new
  // set's new variant marker is covered without a code change.
  const variants = catalog.filter((card) => /\s*\([^)]*\)\s*$/.test(card.name));
  expect(
    variants.length > 0,
    "no promo variants in the catalog — this assertion is not testing anything",
  );
  const knownNames = new Set(catalog.map((card) => card.name.toLowerCase()));
  const orphanVariants = variants.filter((card) => {
    const exported = deckListName(card).toLowerCase();
    // A legend's export carries its champion, which no stored name has; compare
    // the stripped title in that case.
    const stripped = card.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
    return !knownNames.has(exported) && !knownNames.has(stripped);
  });
  expect(
    orphanVariants.length === 0,
    `${orphanVariants.length} promo variant(s) export to a name no card has, e.g. ` +
      `"${orphanVariants[0]?.name}" -> "${orphanVariants[0] && deckListName(orphanVariants[0])}"`,
  );
  expect(
    !variants.some((card) => deckListName(card).includes("(")),
    `a promo variant kept its suffix, e.g. "${variants.find((c) => deckListName(c).includes("("))?.name}"`,
  );

  // ---- the list we hand out is one we would accept back ----------------
  // Not a proof that Piltover accepts it — nothing here can be — but a list our
  // own importer rejects is certainly wrong.
  const sample = [
    ...legends.slice(0, 3),
    ...catalog.filter((c) => c.type === "Unit").slice(0, 5),
    ...catalog.filter((c) => c.type === "Battlefield").slice(0, 2),
  ];
  const exported = toDeckList(sample);
  const parsed = previewImport(exported.text, catalog);
  const unmatched = parsed.rows.filter((row) => row.resolution.status === "unmatched");
  expect(
    parsed.unmatchedCount === 0,
    `our own importer could not match ${parsed.unmatchedCount} exported line(s): ` +
      `${unmatched.map((row) => row.name).join(", ")}`,
  );
  expect(
    parsed.ambiguousCount === 0,
    `${parsed.ambiguousCount} exported line(s) were ambiguous on re-import`,
  );
  expect(
    parsed.totalCopies === exported.count,
    `re-import saw ${parsed.totalCopies} copies against ${exported.count} exported`,
  );

  console.log(
    `deck export: ${catalog.length} cards checked, ${legends.length} legends; ` +
      `${exported.count}-card sample round-tripped through the importer`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  await sql.end();
}

if (failures.length > 0) {
  console.error(`deck export check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("deck export check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
