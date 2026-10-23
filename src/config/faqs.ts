import type { Category } from "./taxonomy";

export type Faq = { q: string; a: string };

/**
 * Self-service answers shown to Seekers before their question goes to a Guide, and on /faq.
 *
 * STARTER CONTENT: written as general, practical guidance so the pilot has something sensible on day one.
 * Review and edit it to match your programme's policies and local context. Keep answers short; anything
 * these don't resolve is what Guides should spend their time on.
 */
export const FAQS: Record<Category, Faq[]> = {
  layoff_unemployment: [
    {
      q: "What should I do in the first week after losing my job?",
      a: "Read your termination or severance documents carefully before signing anything, and note your last working day, notice pay, leave encashment and benefits end dates. Then update your resume, tell your close network that you are looking, and set a simple routine: a few applications and a few conversations each day.",
    },
    {
      q: "How do I explain a layoff in interviews?",
      a: "Keep it short, factual and forward-looking: say the role was affected by a restructuring or cost reduction, that it wasn't about your performance, and then move to what you did well there and what you want next. Don't criticise your former employer.",
    },
    {
      q: "How long does a job search usually take, and how many applications should I send?",
      a: "It varies a lot by field and seniority, and a few months is common. Targeted applications with a tailored resume and a referral usually work better than mass applications. Aim for quality: a handful of well-chosen roles a week plus conversations with people who work in those companies.",
    },
    {
      q: "Should I take any job quickly, or wait for the right one?",
      a: "It depends on your finances and runway. A common middle path is to set a deadline: look for the right role for a defined period, and meanwhile line up a bridge option (contract, freelance or a related role) so a gap doesn't grow.",
    },
  ],
  career_stagnation: [
    {
      q: "How do I know if I am really stuck, or just in a slow phase?",
      a: "Ask whether you are still learning, whether your scope or impact has grown in the last year, and whether people who started alongside you have moved on. If the answer to all three is no for 12 months or more, it is worth acting rather than waiting.",
    },
    {
      q: "How do I ask for a promotion or a bigger role?",
      a: "Prepare a short note with your results, the scope you already handle that matches the next level, and what you want. Ask your manager what is needed for the next level and agree on a timeline. Raise it at a planning or review cycle rather than in passing.",
    },
    {
      q: "Is it better to change teams, change companies, or change fields?",
      a: "Changing teams is the lowest-risk way to get new work. Changing companies is often the fastest way to move up in level or pay. Changing fields means a reset in some respects, so it usually needs skill-building first. A Guide can help you weigh these for your situation.",
    },
    {
      q: "How can I show my work and be noticed?",
      a: "Keep a running list of outcomes you delivered with numbers where possible, share updates with your manager regularly, volunteer for work that is visible, and build relationships beyond your immediate team.",
    },
  ],
  upskilling_training: [
    {
      q: "How do I decide which skill or course is worth my time?",
      a: "Look at 10 job postings for the role you want and note the skills that keep appearing. Pick the one that appears most and that you can practise on a real project. Prefer courses that end in something you can show, like a project or portfolio piece.",
    },
    {
      q: "Do I need a paid course or certification?",
      a: "Not always. Free material is enough to start with. Certifications help most in fields where employers screen for them (cloud, project management, finance, for example). Check job postings in your target area before paying.",
    },
    {
      q: "How can I fit learning around a full-time job?",
      a: "Fix small, regular slots (even 30 to 45 minutes on fixed days) instead of waiting for free weekends, work towards one concrete mini-project at a time, and tell your manager, since some employers support training.",
    },
    {
      q: "How do I prove a new skill to employers without work experience in it?",
      a: "Build two or three small but real projects, write up what you did and the result, and add them to your resume and profile. Volunteer or freelance work for a small organisation also counts.",
    },
  ],
  uncertainty: [
    {
      q: "I don't know what I want to do next. Where do I start?",
      a: "Write down the work you enjoyed and the work that drained you over the last few years, what you are good at, and what you need from a job (pay, flexibility, location). Then talk to two or three people in roles that sound interesting, to test your guesses before changing anything.",
    },
    {
      q: "How do I choose between two options?",
      a: "List what matters most to you, rank it, and score each option against it. Then ask what you would regret not trying. If it is still unclear, find a small reversible way to test one option, such as a short project or a conversation with someone doing it.",
    },
    {
      q: "Is it too late for me to change direction?",
      a: "Rarely. Many people change direction in their 30s, 40s and later, usually by building on skills they already have rather than starting from zero. A Guide who has made a similar change can help you see which of your strengths transfer.",
    },
    {
      q: "How do I handle the anxiety of not having a plan?",
      a: "Break the uncertainty into small steps you can take this month, set a date to review, and talk to someone you trust. It is normal to feel unsettled; a short conversation with a Guide often makes the next step clearer.",
    },
  ],
};
