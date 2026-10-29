/**
 * Presentation copy for the matching UI. `ai` only decides how matching is *described* (AI_BRANDING);
 * it never changes what runs. Consent text uses the real AI_ENABLED value instead (see JoinForm).
 */
export function matchingCopy(ai: boolean) {
  return {
    stages: ai
      ? ["AI is reading your profile", "AI is finding Guides who fit", "AI is ranking your best matches"]
      : ["Starting your search", "Finding Guides who fit", "Ranking the best matches"],
    ready: ai
      ? "Press “Find guides” and our AI will rank Guides who fit your question, and explain why each one could help. Guides never see your name. Your email address is shared only with a Guide you choose to connect with."
      : "Press “Find guides” and we'll rank Guides who fit your question, and explain why each one could help. Guides never see your name. Your email address is shared only with a Guide you choose to connect with.",
    badge: ai ? "AI match" : null,
    landingMatch: ai
      ? ["Get quick answers, then an AI match", "Common questions are answered first. If you still need help, our AI matches you with a Guide and explains why."]
      : ["Get quick answers, then a match", "Common questions are answered first. If you still need help, we match you with a Guide and explain why."],
  };
}
