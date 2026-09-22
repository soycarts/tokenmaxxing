import { renderCard, renderMessageCard, type CardSize, type CardTheme } from "./card";
import { cardDataFromProfile } from "./card-data";
import { getProfilePage } from "./data";
import { HANDLE_RE, type Period } from "./periods";

export const IMAGE_CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/**
 * The card SVG for a handle. Sessionless, so a private profile is private here even to its
 * owner (the card is for other people's pages). Unknown and private handles look the same.
 */
export async function cardSvg(handle: string, period: Period, size: CardSize, theme: CardTheme): Promise<string> {
  if (!HANDLE_RE.test(handle)) return renderMessageCard(null, "private", size, theme);
  const res = await getProfilePage(handle, period);
  if (!res.configured) return renderMessageCard(handle, "not connected", size, theme);
  if (res.error) return renderMessageCard(handle, "unavailable", size, theme);
  if (!res.data || !res.data.public) return renderMessageCard(handle, "private", size, theme);
  return renderCard(cardDataFromProfile(res.data), size, theme);
}
