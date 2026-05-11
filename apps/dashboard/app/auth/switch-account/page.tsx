import { redirect } from "next/navigation"

export default function SwitchAccountPage() {
  redirect("/api/auth/reset-session")
}
