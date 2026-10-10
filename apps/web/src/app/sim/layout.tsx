import { getSessionUser } from "@/lib/auth";
import { EsimSiteChrome } from "@/components/esim-site-chrome";

export default async function SimMarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return <EsimSiteChrome authed={Boolean(user)}>{children}</EsimSiteChrome>;
}
