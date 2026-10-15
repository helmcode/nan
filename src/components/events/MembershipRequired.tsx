import { HACKATHON_UNLOCK_URL, type MembershipStrings } from '../../lib/eventEntitlement';

/**
 * Shown when cloud-api answers `entitlement_required`: the account has no
 * plan that unlocks hackathons. Says so and links to the community plan.
 */
export default function MembershipRequired({ t, compact = false }: { t: MembershipStrings; compact?: boolean }) {
  if (compact) {
    return (
      <span role="alert" class="font-mono text-xs text-neutral-400">
        {t.message}{' '}
        <a href={HACKATHON_UNLOCK_URL} rel="noopener" class="text-violet-400 underline hover:text-violet-300">{t.cta} →</a>
      </span>
    );
  }
  return (
    <div role="alert" class="border border-violet-500/40 bg-violet-500/10 p-4">
      <p class="text-sm leading-relaxed text-white">{t.message}</p>
      <a href={HACKATHON_UNLOCK_URL} rel="noopener" class="btn btn-primary mt-4">{t.cta} →</a>
    </div>
  );
}
