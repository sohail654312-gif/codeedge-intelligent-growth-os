/** Test-only semantically named fixture. No runtime inference or production adapter. */
const definitions={
 LEADS:{metricKey:"lead-qualification-rate",unit:"COUNT",denominator:8},
 CONVERSION:{metricKey:"lead-conversion",unit:"COUNT",denominator:8},
 APPOINTMENTS:{metricKey:"appointment-attendance-rate",unit:"COUNT",denominator:8},
 MISSED_ENQUIRIES:{metricKey:"missed-enquiries",unit:"COUNT",denominator:undefined},
 REVENUE_COST:{metricKey:"revenue-gross",unit:"MINOR_CURRENCY_UNITS",denominator:undefined,currency:"GBP"},
 MARKETING:{metricKey:"marketing-spend",unit:"MINOR_CURRENCY_UNITS",denominator:undefined,currency:"GBP"},
 RETENTION:{metricKey:"customer-retention",unit:"COUNT",denominator:8},
 CAPACITY:{metricKey:"available-slots",unit:"COUNT",denominator:undefined},
};
export function makeMetricFixture(domain,workspaceId,observedAt,changes={},fingerprintPrefix="source-"){
 const def=definitions[domain];if(!def)throw Error("UNKNOWN_TEST_METRIC_DOMAIN");
 return {workspaceId,domain,metricKey:def.metricKey,metricDefinitionVersion:"v1",sourceContractVersion:"business-os-read-model:v1",windowTimezone:"UTC",
 periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt,
 unit:def.unit,numerator:4,...(def.denominator===undefined?{}:{denominator:def.denominator}),
 ...(def.currency===undefined?{}:{currency:def.currency}),evidenceFingerprints:[fingerprintPrefix+domain],
 coverage:"COMPLETE",verification:"UNVERIFIED",...changes};
}
