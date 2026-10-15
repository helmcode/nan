/**
 * Hackathons are unlocked by a NaN plan (Community, Inference or Premium).
 * cloud-api answers register / submission PUT / reassign / vote for an account
 * without one with:
 *   403 {"error":"entitlement_required","capability":"hackathons",
 *        "unlockedBy":["community","inference","premium"]}
 * The events forms turn that into a notice linking to the community plan.
 */

/**
 * Community is the cheapest plan that unlocks hackathons. The platform's
 * /signup sends an account that is already signed in to /welcome?plan=community,
 * which goes straight to checkout, so one link works for everyone.
 */
export const HACKATHON_UNLOCK_URL = 'https://cloud.nan.builders/signup?plan=community';

export interface MembershipStrings {
  message: string;
  cta: string;
}

export function isEntitlementRequired(code: string | null | undefined): boolean {
  return code === 'entitlement_required';
}
