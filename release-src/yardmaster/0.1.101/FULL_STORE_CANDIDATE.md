# Yardmaster 0.1.101 testing candidate

Repairs the two remaining failures in the supplied 0.1.100 handoff: hidden phone navigation at desktop width and iPhone input-archive contamination of the repair-download fixture. Existing application behavior assertions are retained and strengthened. See REPAIR_REPORT.md.

Run npm run test:loop:update:repair for the scoped Node and desktop/Android/iPhone Playwright checks. Browser revalidation and native installation remain pending. The full Play Store/release gate was not run. Production is unchanged.
