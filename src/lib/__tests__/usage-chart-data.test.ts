import { describe, expect, it } from "vitest";
import { buildActionCostSeries } from "../admin/usage-chart-data";

describe("buildActionCostSeries", () => {
  it("always includes synonym and phrase-revise rows even at zero", () => {
    const series = buildActionCostSeries([
      { action_type: "generate", calls: 10, estimated_cost_usd: 1.25 },
    ]);

    expect(series.map((row) => row.action)).toEqual([
      "synonyms",
      "revise_expand",
      "revise_compress",
      "revise_rephrase",
      "generate",
    ]);
    expect(series[0]).toMatchObject({
      label: "Synonym suggestions",
      calls: 0,
      cost: 0,
      featured: true,
    });
    expect(series.at(-1)).toMatchObject({
      action: "generate",
      cost: 1.25,
      featured: false,
    });
  });

  it("uses recorded synonym and expand costs", () => {
    const series = buildActionCostSeries([
      { action_type: "synonyms", calls: 8, estimated_cost_usd: 0.012 },
      { action_type: "revise_expand", calls: 2, estimated_cost_usd: 0.04 },
      { action_type: "revise_selection", calls: 3, estimated_cost_usd: 0.09 },
    ]);

    const byAction = Object.fromEntries(series.map((row) => [row.action, row]));
    expect(byAction.synonyms).toMatchObject({ calls: 8, cost: 0.012, featured: true });
    expect(byAction.revise_expand).toMatchObject({ calls: 2, cost: 0.04, featured: true });
    expect(byAction.revise_selection).toMatchObject({
      label: "Phrase revise",
      calls: 3,
      cost: 0.09,
      featured: false,
    });
  });
});
