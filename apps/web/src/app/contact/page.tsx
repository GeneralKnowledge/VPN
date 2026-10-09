import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Button, Input, Label, Textarea } from "@/components/ui";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <MarketingPage
      title="Contact"
      description={`Reach ${brand.shortName}. We read every message — for account-specific help, signed-in customers can also open a dashboard ticket.`}
    >
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
          <Textarea id="body" name="body" required rows={5} />
        </div>
        <Button type="submit">Send message</Button>
      </form>
      <p className="mt-4 text-sm text-muted">Or email {brand.supportEmail}</p>
    </MarketingPage>
  );
}
