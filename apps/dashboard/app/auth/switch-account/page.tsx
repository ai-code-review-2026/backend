import { redirect } from "next/navigation"

export default function SwitchAccountPage() {
  redirect("/auth/reset-session/")
}
