export const PADALIX_PITCH_DECK_URL = "/documents/padalix-pitch-deck.pdf";
export const PADALIX_PITCH_DECK_COVER_URL = "/images/padalix-pitch-deck-cover.jpg";
export const PADALIX_PITCH_DECK_LABEL = "PADALIX PITCH DECK / DEMO DAY";

export function mediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.replace(/^\/+/, "");
  return `/${normalizedPath}`;
}
