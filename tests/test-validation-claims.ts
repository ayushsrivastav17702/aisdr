// Comprehensive test for source-based validation for AI email content
import { validateUnverifiedClaims, VerifiedSignals, UnverifiedClaimError } from '../server/services/ai-email-generator.service';

console.log("\n🔒 SOURCE-BASED VALIDATION TEST SUITE (EXPANDED)\n");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

function test(name: string, body: string, subject: string, signals: VerifiedSignals | undefined, expectedBlocked: boolean) {
  const result = validateUnverifiedClaims(body, subject, signals);
  const success = result.isBlocked === expectedBlocked;
  if (success) passed++; else failed++;
  console.log(`\n📋 ${name}`);
  console.log(`   Body: ${body.substring(0, 55)}...`);
  console.log(`   Signals: ${signals ? Object.keys(signals).join(', ') : 'None'}`);
  console.log(`   Expected: ${expectedBlocked ? 'BLOCKED' : 'ALLOWED'}`);
  console.log(`   Result: ${result.isBlocked ? '🚫 BLOCKED' : '✅ ALLOWED'}`);
  if (result.violations?.length) {
    console.log(`   Violation: ${result.violations[0].type} - "${result.violations[0].matchedText}"`);
  }
  console.log(`   ${success ? '✅ PASS' : '❌ FAIL'}`);
}

// FUNDING TESTS
test("Unverified Series B", "Congratulations on your Series B funding!", "Funding", undefined, true);
test("Unverified raised amount", "I saw you raised $50M recently.", "Growth", undefined, true);
test("Unverified seed round", "Your seed funding is impressive.", "Congrats", undefined, true);
test("Unverified backed by", "I see you're backed by top VCs.", "Partnership", undefined, true);
test("Verified Series B", "Congratulations on your Series B!", "Funding", { funding: { round: "Series B", source: "TechCrunch" } }, false);

// HIRING TESTS
test("Unverified hiring", "I noticed you're hiring for several roles.", "Question", undefined, true);
test("Unverified scaling team", "You're scaling the team rapidly.", "Growth", undefined, true);
test("Unverified hired VP", "I saw you hired a new VP of Sales.", "News", undefined, true);
test("Verified hiring", "I see you're hiring for engineering.", "Roles", { hiring: { roles: ["Engineer"], source: "LinkedIn" } }, false);

// EXPANSION TESTS
test("Unverified expansion", "Your expansion into Europe is exciting.", "Growth", undefined, true);
test("Unverified new office", "Congrats on the new office in London!", "News", undefined, true);
test("Verified expansion", "Your expansion into Europe is exciting.", "Growth", { expansion: { type: "geographic", source: "Press" } }, false);

// NEWS TESTS
test("Unverified saw news", "I saw the news about your company.", "Congrats", undefined, true);
test("Unverified press release", "Read your recent press release.", "News", undefined, true);
test("Verified news", "I saw the news about your launch.", "Congrats", { news: { headline: "Product launch", source: "Blog" } }, false);

// LAUNCH TESTS
test("Unverified product launch", "Just shipped a new product I see!", "Launch", undefined, true);
test("Verified launch", "Your new product launch looks great!", "Launch", { launch: { product: "Widget 2.0", source: "ProductHunt" } }, false);

// PARTNERSHIP TESTS
test("Unverified partnership", "I see you partnered with Acme Corp.", "Partnership", undefined, true);
test("Verified partnership", "Your partnership with Acme is exciting.", "Collab", { partnership: { partner: "Acme", source: "PR" } }, false);

// ACQUISITION TESTS
test("Unverified acquisition", "Congrats on acquiring that startup!", "M&A", undefined, true);
test("Verified acquisition", "The acquisition of XYZ makes sense.", "M&A", { acquisition: { target: "XYZ", source: "TechCrunch" } }, false);

// AWARD TESTS
test("Unverified award", "I see you won an award recently!", "Congrats", undefined, true);
test("Verified award", "Congrats on winning Best Startup!", "Award", { award: { name: "Best Startup", source: "Forbes" } }, false);

// CLEAN EMAILS
test("Clean - no claims", "Hi John, I wanted to discuss merchandising.", "Question", undefined, false);
test("Clean with prospect data", "Hi John, as VP of Sales at Acme in retail...", "Question", undefined, false);

console.log("\n" + "=".repeat(70));
console.log(`\n🏁 TEST RESULTS: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
