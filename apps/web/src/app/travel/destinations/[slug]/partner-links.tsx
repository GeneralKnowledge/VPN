import { Badge } from "@/components/ui";
import type { DestinationPartnerLinks } from "@/lib/partner-links";

/**
 * Referral links to travel partners (docs/TRAVEL-HUB.md rules 3 and 4): the commission notice
 * sits right above the links, links never show a price, and partners are listed by name.
 */
export function PartnerLinks({ destinationName, links }: { destinationName: string; links: DestinationPartnerLinks }) {
  const disclosures = new Map<string, string>();
  for (const group of links.groups) {
    for (const link of group.links) disclosures.set(link.partnerId, link.disclosure);
  }
  return (
    <div>
      <p className="rounded-md bg-surface-2 px-3 py-2 text-sm" role="note">
        {links.notice}
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        {links.groups.map((group) => (
          <div key={group.category}>
            <h3 className="font-medium">{group.title}</h3>
            <ul className="mt-2 space-y-2" aria-label={`${group.title} partners for ${destinationName}`}>
              {group.links.map((link) => (
                <li key={link.id} className="text-sm">
                  <a href={link.path} rel="sponsored nofollow noopener">
                    <span className="text-sea underline">{link.label}</span>
                  </a>
                  {link.test ? (
                    <span className="ml-2 align-middle">
                      <Badge tone="neutral">Test partner</Badge>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul className="mt-6 space-y-1 text-xs text-muted">
        {[...disclosures.values()].map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        You book with the partner, not with us. Prices and availability are theirs.
      </p>
    </div>
  );
}
