# @northstar/destinations

Travel Hub's destination facts: currency, language, plugs, driving side, emergency numbers, which eSIM catalogue codes cover the destination, and the UK government (FCDO) travel advice page. See [docs/TRAVEL-HUB.md](../../docs/TRAVEL-HUB.md).

- Data lives in `src/data.ts` and is validated by `src/types.ts` when the package loads, so a bad entry fails tests and the build, never a page.
- Visa and entry rules are never written here; pages link to the FCDO's own entry requirements page.
- Each entry has `review: null` until a person checks it against official sources; set `review: { checkedOn, checkedBy }` then. Pages show unchecked facts as a draft.
- Region codes in `esimCodes` (for example `EU`) are the eSIM provider's; check them against the live catalogue when ResellPortal is connected.
