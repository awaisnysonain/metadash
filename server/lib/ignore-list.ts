// Temporary ignore list for specific Pages/IG accounts (by numeric ID)
// Reason: user requested to ignore these pages for now

// Facebook Page IDs to ignore
export const IGNORED_PAGE_IDS = new Set<string>([
  '881447871719659',   // Ugcbytengy
  '550691848130241',   // Angelene Susanna
  '133818696483555',   // Sb.beautyadvisor
  '1523604421207779',  // Kelly Prince-Wright
  '107142858668758',   // Christinakatelobo
  '100415341860528',   // Assot Huragan
  '315042669208836',   // Christina Haltner
  '1683868875259513',  // Lemons for Days by Jasmin Shannon
]);

// Instagram business account IDs to ignore (for webhook body.object === 'instagram')
export const IGNORED_IG_ACCOUNT_IDS = new Set<string>([
  '17841469112389967', // @ugcbytengy
  '17841403356375249', // @angelenees.ugc
  '17841459037708724', // @sb.beautyadvisor
  '17841401113312175', // @kellyprincewright
  '17841400858337893', // @christinakatelobo
  '17841400383237772', // @desir.gt (Assot Huragan)
  '17841400097135981', // @chaltner (Christina Haltner)
  '17841403003876198', // @lemons.for.days
]);

export function isIgnoredPageId(id?: string | null): boolean {
  return Boolean(id && IGNORED_PAGE_IDS.has(String(id)));
}

export function isIgnoredInstagramAccountId(id?: string | null): boolean {
  return Boolean(id && IGNORED_IG_ACCOUNT_IDS.has(String(id)));
}
