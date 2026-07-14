import { redirect } from "next/navigation";
import { API_BASE_URL } from "@/lib/env";

type ReferralRedirectProps = {
  params: Promise<{ code: string }>;
};

export default async function ReferralRedirect({ params }: ReferralRedirectProps) {
  const { code } = await params;
  redirect(`${API_BASE_URL}/api/referrals/click/${encodeURIComponent(code)}`);
}
