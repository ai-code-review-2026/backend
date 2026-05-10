export const clerkAuthAppearance = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full !border-0 !shadow-none !outline-none",
    card: "w-full border-0 bg-transparent p-0 shadow-none",
    headerTitle:
      "text-[1.95rem] leading-tight font-semibold tracking-[-0.04em] text-foreground",
    headerSubtitle: "mt-2 text-sm text-muted-foreground",
    header: "px-4 pt-5",
    form: "px-4 pb-5",
    socialButtonsBlockButton:
      "h-11 rounded-xl border-0 bg-[#E8E8EA] dark:bg-[#151820] text-foreground shadow-none transition-colors hover:bg-[#DDDDE0] dark:hover:bg-[#1A1F2A]",
    socialButtonsBlockButtonText: "text-sm font-medium text-foreground",
    dividerLine: "bg-[#D4D4D6] dark:bg-[#1A1D23]",
    dividerText: "text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "h-11 rounded-xl border-0 bg-[#E8E8EA] dark:bg-[#151820] text-sm text-foreground shadow-none focus:ring-0",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    formButtonPrimary:
      "h-11 rounded-xl bg-orange text-sm font-semibold text-white shadow-none transition-colors hover:bg-orange-hover",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink: "text-sm font-medium text-teal hover:text-teal/80",
    footer: "hidden",
    footerPages: "hidden",
    identityPreviewText: "text-sm text-muted-foreground",
    formFieldErrorText: "text-sm text-red-500",
    formFieldSuccessText: "text-sm text-green-status",
    formResendCodeLink: "text-sm font-medium text-teal hover:text-teal/80",
    otpCodeFieldInput:
      "h-11 rounded-xl border-0 bg-[#E8E8EA] dark:bg-[#151820] text-sm text-foreground focus:ring-0",
    alertText: "text-sm text-muted-foreground",
  },
} as const
