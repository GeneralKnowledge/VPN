import { getProductBrand } from "@/lib/product";
import { isProduction } from "@/lib/providers";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  return <LoginForm showDevHint={!isProduction()} brand={await getProductBrand()} />;
}
