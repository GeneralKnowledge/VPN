import { isProduction } from "@/lib/providers";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return <LoginForm showDevHint={!isProduction()} />;
}
