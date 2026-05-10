/**
 * Configuration des couleurs pour les icônes Iconsax
 * Utilise les couleurs Tailwind CSS pour la cohérence
 */

export const iconColors = {
  // Couleurs principales
  primary: "rgb(59, 130, 246)", // blue-500
  secondary: "rgb(107, 114, 128)", // gray-500
  
  // Statuts
  success: "rgb(34, 197, 94)", // green-500
  warning: "rgb(245, 158, 11)", // amber-500
  error: "rgb(239, 68, 68)", // red-500
  info: "rgb(59, 130, 246)", // blue-500
  
  // Contextes spécialisés
  security: "rgb(147, 51, 234)", // purple-600
  performance: "rgb(236, 72, 153)", // pink-500
  code: "rgb(99, 102, 241)", // indigo-500
  folder: "rgb(251, 191, 36)", // amber-400
  
  // Thèmes
  light: "rgb(55, 65, 81)", // gray-700
  dark: "rgb(229, 231, 235)", // gray-200
} as const;

/**
 * Configuration des variantes par contexte
 */
export const contextVariants = {
  navigation: "Bold" as const,
  actions: "Linear" as const,
  status: "Bold" as const,
  content: "Outline" as const,
  decorative: "TwoTone" as const,
} as const;

/**
 * Configuration des tailles par contexte d'utilisation
 */
export const contextSizes = {
  navigation: "lg" as const,
  actions: "default" as const,
  status: "default" as const,
  content: "sm" as const,
  decorative: "xl" as const,
  button: "default" as const,
  inline: "sm" as const,
  card: "xl" as const,
  hero: "xl" as const,
} as const;

/**
 * Helper pour obtenir la configuration d'une icône par contexte
 */
export function getIconConfig(context: keyof typeof contextVariants) {
  return {
    variant: contextVariants[context],
    size: contextSizes[context] || "default",
  };
}