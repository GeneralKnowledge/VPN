import { redirect } from "next/navigation";

/** Devices are managed as named connections on the VPN page. */
export default function DevicesRedirectPage() {
  redirect("/dashboard/vpn");
}
