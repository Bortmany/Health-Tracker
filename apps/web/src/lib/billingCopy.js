// Every sentence, label and price on the money screens lives in this one file,
// so the wording can be reviewed (and one day translated) in one place.
// Screens import from here; no money sentence is typed inside a screen.
// Prices and percentages come from lib/pricing.js and lib/money.js.
import {
  COACH_STARTUP_FEE,
  COMMISSION_LOW_FROM_STUDENTS,
  COMMISSION_PERCENT,
  COMMISSION_PERCENT_LOW,
  EXAMPLE_STUDENT_PRICE,
  PRICE_MONTHLY,
  PRICE_YEARLY,
  STUDENT_PRICE_MAX,
  STUDENT_PRICE_MIN,
  formatPrice,
  monthlyPriceLabel,
  savingsChipLabel,
  yearlyPerMonth,
} from './pricing.js';
import { coachKeepsCents, cutCents, formatCents, formatCentsShort, formatDay, formatDollars } from './money.js';

const STARTUP_FEE = formatDollars(COACH_STARTUP_FEE);
const MIN = formatDollars(STUDENT_PRICE_MIN);
const MAX = formatDollars(STUDENT_PRICE_MAX);
const EXAMPLE_CENTS = EXAMPLE_STUDENT_PRICE * 100;
const TOO_MANY = 'Too many tries. Please wait a few minutes and try again.';

// ---- Shared by every money button ----
export const common = {
  comingSoon: 'Coming soon',
  moneyOffHint: "Payments aren't switched on yet. We'll turn them on soon.",
  moneyOffNote: 'Payments are coming soon. Nothing is charged yet.',
  payoutsOffHint: "Payouts aren't switched on yet.",
  emailOffBefore: 'Email isn’t switched on yet. Contact us at ',
  emailOffAfter: " and we'll help.",
  retry: 'Retry',
  retrying: 'Retrying...',
  back: '← Back',
  checkoutOpening: 'Opening checkout...',
  checkoutError: "Couldn't open checkout — please try again.",
  showMore: 'Show more',
  loading: 'Loading...',
};

// ---- The small status pills ----
export const pills = {
  active: 'Active',
  endsOn: (day) => `Ends ${day}`,
  paymentIssue: 'Payment issue',
  ended: 'Ended',
  pending: 'Pending',
  manualReview: 'Needs a check',
  paid: 'Paid',
  failed: 'Failed',
  setupNeeded: 'Set up needed',
  identityNotChecked: 'Identity not checked',
  revoked: 'Revoked',
  headsUp: 'Heads up',
  waitingForPayment: 'Waiting for payment',
};

// ---- Plain-English messages for the error codes the server can send ----
export const serverErrors = {
  BILLING_DISABLED: "Payments aren't switched on yet. We'll turn them on soon.",
  PAYOUTS_DISABLED: "Payouts aren't switched on yet.",
  EMAIL_DISABLED: "Email isn't switched on yet.",
  COACH_NOT_READY: "That coach hasn't finished setting up payments yet. Please try again later.",
  PRICE_TOO_LOW: `The lowest price is ${MIN} a month.`,
  PRICE_TOO_HIGH: `The highest price is ${MAX} a month.`,
  LINK_INVALID: 'This link has expired or was already used. Reset links work once, for one hour.',
  RATE_LIMITED: TOO_MANY,
};

// ---- 1. Coach: Get paid card ----
export const getPaid = {
  title: 'Get paid',
  intro:
    'Three quick steps and you can take paying students. Students you already coach with an invite code stay free.',
  step1Title: `Pay the one-time ${STARTUP_FEE} startup fee.`,
  step1Line: `Pay once, never again. You keep ${100 - COMMISSION_PERCENT}% of every student payment.`,
  step1Button: `Pay ${STARTUP_FEE}`,
  step1Done: (day) => `Paid on ${formatDay(day)}`,
  step2Title: 'Verify your identity.',
  step2Line:
    'Our payment partner Whop checks who you are so we can send you money. It takes a few minutes.',
  step2Button: 'Verify identity',
  step2Locked: 'Pay the startup fee first',
  step2Opening: 'Opening Whop...',
  step2Done: 'Verified',
  step3Title: 'Take paying students.',
  step3Waiting: 'Waiting for steps 1 and 2',
  step3Done: 'Students who ask to train with you can now pay and start.',
  priceLabel: 'Your monthly price for students',
  pricePrefix: '$',
  priceSuffix: 'a month',
  pricePlaceholder: String(EXAMPLE_STUDENT_PRICE),
  priceHelper: `Between ${MIN} and ${MAX}. A change applies to new students only; people already training with you keep their current price.`,
  keepLine: (priceCents, rate) => {
    const keeps = coachKeepsCents(priceCents, rate);
    if (keeps == null) return null;
    const why =
      rate === COMMISSION_PERCENT_LOW
        ? `we take ${rate}% because you coach ${COMMISSION_LOW_FROM_STUDENTS}+ paying students`
        : `we take ${rate}%`;
    return `You'd keep ${formatCents(keeps)} of every ${formatCentsShort(priceCents)} payment (${why}).`;
  },
  priceErrors: {
    empty: 'Enter a price, like 30.',
    nan: 'Use numbers only, like 30.',
    low: `The lowest price is ${MIN} a month.`,
    high: `The highest price is ${MAX} a month.`,
  },
  savePrice: 'Save price',
  saving: 'Saving...',
  priceSavedToast: (cents) => `Price saved. New students will pay ${formatCentsShort(cents)} a month.`,
  saveError: "Couldn't save that — please try again.",
  loadError: "Couldn't load your payment details — please try again.",
  revoked:
    'Your coaching access has ended, so there is nothing to set up. Any money already owed to you is still yours; see below.',
  moreRowLabel: 'Payments',
  moreRowActive: 'Active',
  moreRowSetup: 'Set up needed',
  moreRowLink: 'Open Get paid',
};

// ---- 1b. Earnings ----
export const earnings = {
  title: 'Your earnings',
  thisMonth: 'This month',
  allTime: 'All time',
  owed: 'Owed to you',
  paidOut: 'Paid out',
  beingChecked: (cents) => `${formatCents(cents)} being checked`,
  settledBy: 'Settled by Whop',
  settledLine: 'Whop pays your share to you directly. The list below is for your records.',
  hints: {
    thisMonth: "Your share of payments received this calendar month, after Cut's cut",
    allTime: "Everything you've earned since you started",
    owed: 'Earned but not sent to your bank yet',
    paidOut: 'Money already sent to you',
  },
  fromStudents: (n) => (Number.isInteger(n) && n >= 0 ? `From ${n} student${n === 1 ? '' : 's'}` : null),
  nextPayout: 'Next payout: when we run payouts',
  explainer: `Figures show your share after Cut's ${COMMISSION_PERCENT}% (${COMMISSION_PERCENT_LOW}% with ${COMMISSION_LOW_FROM_STUDENTS}+ paying students).`,
  negativeLine: "A refund came after we paid you. We'll take this off your next payout.",
  historyTitle: 'Payout history',
  colDate: 'Date',
  colStatus: 'Status',
  colAmount: 'Amount',
  emptyPayouts:
    'No payouts yet. Your first student payment turns up here, and your first payout follows. Share your profile link to get the ball rolling ☕',
  copyLink: 'Copy my profile link',
  linkCopied: 'Link copied',
  loadError: "Couldn't load your earnings — please try again.",
  payoutsError: "Couldn't load your payouts — please try again.",
};

// ---- 1c. Coach inbox ----
export const inbox = {
  notReadyLine: 'Finish the Get paid steps first, then you can accept.',
  goToGetPaid: 'Go to Get paid',
  acceptHint:
    'You need to pay the startup fee and verify your identity before taking paying students.',
};

// ---- 2. Student: pay step ----
export const student = {
  accepted: (name) => `${name} accepted you.`,
  perMonth: (cents) => `${formatCentsShort(cents)} a month`,
  billedLine:
    "Billed monthly. Cancel any time, you keep access until the end of the month you've paid for.",
  payButton: (cents, firstName) => `Pay ${formatCentsShort(cents)}/month to start with ${firstName}`,
  notNow: 'Not now',
  notNowToast: (name) => `No problem. The offer stays open until ${name} cancels it.`,
  cancelRequest: 'Cancel request',
  cancelling: 'Cancelling...',
  cancelledToast: 'Request cancelled',
  cancelError: "Couldn't cancel that — please try again.",
  confirming: "We're confirming your payment. This can take a minute.",
  checkAgain: 'Check again',
  noPayment: "No payment was taken. Pick this up whenever you're ready.",
  offNote: (name) =>
    `Payments are coming soon. ${name} has accepted you; we'll let you pay as soon as it's switched on.`,
  nowTraining: (name) => `You're now training with ${name}`,
  gone: 'That coach is no longer available.',
  coachFallback: 'Your coach',
};

// ---- 3. Subscription page ----
export const subscription = {
  pageTitle: 'Subscription',
  manageLink: 'Manage subscription',
  aiTitle: 'AI plan',
  coachTitle: (name) => `Coaching with ${name}`,
  endedTitle: (title, day) => `${title} (ended ${day})`,
  perMonth: 'a month',
  perYear: 'a year',
  yearlyPerMonthNote: (cents) => `(${formatCents(cents)} a month)`,
  nextCharge: 'Next charge',
  started: 'Started',
  status: 'Status',
  statusActive: 'Renews automatically.',
  statusCancelled: (day) => `Cancelled. You keep access until ${day}.`,
  statusIssue: "Your last payment didn't go through. We're trying again, and you keep access meanwhile.",
  statusEnded: 'This subscription has ended.',
  cancelButton: 'Cancel subscription',
  cancelHint: "Stops future charges. You keep access until the end of the period you've paid for.",
  cancelAi: (day) =>
    `Cancel your AI plan? You won't be charged again, and you'll keep it until ${day}. After that your account goes back to the free plan (your logs and plans stay).`,
  cancelCoach: (name, day) =>
    `Cancel training with ${name}? You won't be charged again and you keep access until ${day}. ${name} will be told.`,
  confirmCancel: 'Yes, cancel',
  keepPlan: 'Keep my plan',
  cancellingBusy: 'Cancelling...',
  cancelledToast: (day) => `Subscription cancelled. You keep access until ${day}.`,
  restartNote: (day) => `To restart, subscribe again after ${day}.`,
  cancelError: "Couldn't cancel that — please try again. If it keeps happening, contact us.",
  loadError: "Couldn't load your subscription — please try again.",
  subscribeAgain: 'Subscribe again',
  findCoach: 'Find a coach',
  pickerTitle: 'Get the AI plan',
  monthlyTile: 'Monthly',
  yearlyTile: 'Yearly',
  monthlyPrice: monthlyPriceLabel(),
  yearlyPrice: `${formatPrice(PRICE_YEARLY)} a year`,
  yearlyDetail: `${formatPrice(yearlyPerMonth(PRICE_YEARLY))}/mo, billed yearly`,
  saveChip: savingsChipLabel(),
  subscribeMonthly: `Subscribe, ${formatPrice(PRICE_MONTHLY)} a month`,
  subscribeYearly: `Subscribe, ${formatPrice(PRICE_YEARLY)} a year`,
  pickerNote: 'Cancel anytime. Powered by secure checkout.',
  benefits: [
    'An AI plan written from your quiz',
    'Adjusted every week from your workouts, weigh-ins and recovery',
    'Your plan history, week by week',
    'Everything else stays free',
  ],
  premiumOn: 'Your AI plan is on. There is nothing to pay or cancel here.',
  emptyFree:
    "You're on the free plan. It already includes your full 52-week workout plan, logging and charts. Nothing to pay, nothing to cancel.",
  seeAiPlan: 'See what the AI plan adds',
};

// ---- The quiet upgrade card on Train / More ----
export const upgrade = {
  title: 'Get a plan that adjusts to you every week',
  button: 'Choose a plan',
  note: 'Cancel anytime.',
  manage: 'Manage subscription',
  offNote: "Paid upgrades aren't switched on yet — the AI plan will be available soon.",
};

// ---- 4. Pricing page ----
export const pricing = {
  headline: 'Simple pricing.',
  sub: 'Cut is free to start. Pay only if you want an AI-written plan, or a coach.',
  freeTitle: 'Free',
  freePrice: '$0, always',
  freeBody:
    'Full tracking (weight, sleep, habits, training, streaks) and a workout plan matched to you: the full 52-week plan, free for everyone.',
  aiTitle: 'AI plan',
  aiPrice: `${formatPrice(PRICE_MONTHLY)} a month, or ${formatPrice(PRICE_YEARLY)} a year`,
  aiChip: savingsChipLabel(),
  aiBody:
    'A plan written for you by AI that adjusts itself every week from your workouts, weigh-ins and recovery. Cancel anytime.',
  aiButton: 'See the AI plan',
  coachTitle: 'Coaching',
  coachPrice: `Your coach sets the price: ${MIN} to ${MAX} a month.`,
  coachBody:
    "A real coach builds your program and checks in on you. You pay your coach's price each month and cancel any time.",
  coachButton: 'Find a coach',
  cutTitle: "How Cut's cut works",
  cutLines: [
    `Coaches pay Cut ${STARTUP_FEE} once to join.`,
    `Cut keeps ${COMMISSION_PERCENT}% of what each student pays their coach. Once a coach has ${COMMISSION_LOW_FROM_STUDENTS} or more paying students, Cut keeps ${COMMISSION_PERCENT_LOW}%.`,
    `The rest goes to the coach. Example: a ${formatDollars(EXAMPLE_STUDENT_PRICE)} plan pays the coach ${formatCents(coachKeepsCents(EXAMPLE_CENTS, COMMISSION_PERCENT))} and Cut ${formatCents(cutCents(EXAMPLE_CENTS, COMMISSION_PERCENT))}.`,
  ],
  exampleStudent: `Student pays ${formatCents(EXAMPLE_CENTS)}`,
  exampleCoach: `Coach keeps ${formatCents(coachKeepsCents(EXAMPLE_CENTS, COMMISSION_PERCENT))}`,
  exampleCut: `Cut keeps ${formatCents(cutCents(EXAMPLE_CENTS, COMMISSION_PERCENT))}`,
  reassurance:
    'Payments are handled by Whop. You can cancel any time and keep access until the end of the period you paid for.',
  refundLink: 'Refund policy',
  termsLink: 'Terms',
  questions: 'Questions?',
  fullPricingLink: 'See full pricing',
  footerPricing: 'Pricing',
};

// ---- 5. Forgot / reset password ----
export const auth = {
  forgotLink: 'Forgot password?',
  forgotHint: 'Get a link by email to choose a new password',
  forgotSubtitle: "Forgot your password? Enter your email and we'll send you a link.",
  emailLabel: 'Email',
  emailPlaceholder: 'JohnDoe@gmail.com',
  sendLink: 'Send reset link',
  sending: 'Sending...',
  backToLogin: 'Back to log in',
  sentNotice:
    "If there's a Cut account for that email, we've sent a link to choose a new password. It works for one hour. Check your spam folder too.",
  sendAgain: 'Send again',
  sentAgainToast: 'Sent again',
  tooMany: TOO_MANY,
  network: "Couldn't send that — please check your connection and try again.",
  emailOffBefore: 'Password reset is coming soon. Contact us at ',
  emailOffAfter: " and we'll help you get back in.",
  resetSubtitle: 'Choose a new password.',
  newPassword: 'New password',
  newPasswordHint: 'At least 8 characters',
  again: 'Type it again',
  tooShort: 'Use at least 8 characters.',
  mismatch: "The two passwords don't match.",
  savePassword: 'Save new password',
  savingPassword: 'Saving...',
  resetDone: "Your password is changed. You've been signed out everywhere, so log in with the new one.",
  logIn: 'Log in',
  linkBad: 'This link has expired or was already used. Reset links work once, for one hour.',
  getNewLink: 'Get a new link',
  saveError: "Couldn't save that — please check your connection and try again.",
};

// ---- 6. Owner: coaches and payouts ----
export const admin = {
  payoutsTitle: 'Payouts',
  owedLabel: 'Owed to coaches',
  owedHint: "What we've collected on coaches' behalf and haven't paid out yet",
  owedSub: (count) =>
    `Across ${count} coach${count === 1 ? '' : 'es'}. Counts only coaches who've finished the identity check.`,
  payButton: 'Pay coaches now',
  methodAHint: 'Whop pays coaches automatically. Nothing for you to press.',
  methodALine: 'Whop pays coaches directly.',
  nothingHint: 'Nobody is owed anything right now.',
  allPaidUp: 'All paid up. Your coaches are happy ☕',
  payoutsOffNote: 'Payouts are coming soon. Amounts below are being recorded already.',
  confirmSend: (cents, count, skipped) =>
    `Send ${formatCents(cents)} to ${count} coach${count === 1 ? '' : 'es'} now? Money moves to their accounts and can't be taken back.${
      skipped > 0
        ? ` ${skipped} coach${skipped === 1 ? " isn't" : "es aren't"} included (identity check not finished).`
        : ''
    }`,
  sendPayouts: 'Send payouts',
  notYet: 'Not yet',
  startedToast: (cents, count) =>
    `Payouts started: ${formatCents(cents)} to ${count} coach${count === 1 ? '' : 'es'}`,
  partialFail: (failed, total) =>
    `${failed} of ${total} payouts didn't go through. Nothing was lost; press Pay coaches now to retry.`,
  runError: "Couldn't start the payouts — please try again.",
  negativeLead: (n) =>
    `${n} coach${n === 1 ? ' has' : 'es have'} a negative balance because of refunds. They won't be paid until it clears: `,
  loadError: "Couldn't load payouts — please try again.",
  owed: 'Owed',
  paidSoFar: (cents) => `Paid so far ${formatCents(cents)}`,
  beingChecked: (cents) => `Being checked ${formatCents(cents)}`,
  resolve: {
    sent: 'Mark as sent',
    notSent: 'Mark as not sent',
    noteLabel: 'What did you check?',
    notePlaceholder: 'e.g. Seen in the Whop transfers list on 3 Oct',
    confirmSent: "Confirm: it WAS sent. It will show as paid and the money won't be offered to the coach again.",
    confirmNotSent: "Confirm: it was NOT sent. The money goes back to what the coach is owed and will be sent in the next payout.",
    confirm: 'Yes, save it',
    cancel: 'Cancel',
    saving: 'Saving...',
    needNote: 'Add a short note first.',
    error: "Couldn't save that — please try again.",
    done: 'Payout updated',
    hint: 'Check with the payment company first. This cannot be undone.',
  },
  formerTitle: 'Former coaches still owed',
  formerLine: 'Their unpaid money is still theirs and is paid in the next payout.',
  identityHint: 'No money is sent until they finish the check',
  historyTitle: 'Payout history',
  historyEmpty: 'No payouts yet. Press Pay coaches now once a coach is owed something.',
  historyError: "Couldn't load payout history — please try again.",
  refCopied: 'Reference copied',
  refHint: 'Tap to copy',
  lastPayout: (status) => `Last payout status: ${status}`,
};
