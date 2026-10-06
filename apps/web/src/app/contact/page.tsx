import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Button, Input, Label } from "@/components/ui";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <MarketingPage title="Contact" description={`Reach ${brand.shortName} — messages are stored locally in mock mode.`}>
      <form action="/api/support" method="post" className="max-w-md space-y-4">
        <input type="hidden" name="source" value="contact" />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" required placeholder="How can we help?" />
        </div>
        <div>
          <Label htmlFor="body">Message</Label>
          <textarea
            id="body"
            name="body"
            required
            rows={5}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit">Send message</Button>
      </form>
      <p className="mt-4 text-sm text-muted">Or email {brand.supportEmail}</p>
    </MarketingPage>
  );
}
