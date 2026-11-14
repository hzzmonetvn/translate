const normalize = (value) => value.toLocaleLowerCase();

export const containsTerm = (text, term) => normalize(text).includes(normalize(term));

export function relevantGlossary(glossary, texts) {
  if (!glossary?.length || !texts.length) return [];
  return glossary.filter((entry) => texts.some((text) => containsTerm(text, entry.source)));
}

export function glossaryInstruction(entries) {
  if (!entries.length) return '';
  const pairs = entries.map((entry) => `"${entry.source.replaceAll('"', "'")}" → "${entry.target.replaceAll('"', "'")}"`).join('; ');
  return ` Required terminology (use exactly these target terms wherever the source term appears, without translating them again): ${pairs}.`;
}

export function missingGlossary(entries, source, translated) {
  return entries.filter((entry) => containsTerm(source, entry.source) && !containsTerm(translated, entry.target));
}

export function strictGlossaryNote(missing) {
  if (!missing.length) return '';
  return ` The previous attempt did not use: ${missing.map((entry) => `"${entry.source}" → "${entry.target}"`).join('; ')}. Rewrite so each of those target terms appears exactly.`;
}
