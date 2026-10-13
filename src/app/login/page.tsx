import { LoginForm } from "@/components/login-form";
import { isConfigured } from "@/lib/supabase/server";
export default function Page() {
  return <LoginForm configured={isConfigured()} />;
}
