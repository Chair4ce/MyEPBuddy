import { describe, expect, it } from "vitest";
import {
  getDefaultFeedbackSessionGuide,
  getFeedbackGuideFormLabel,
} from "../feedback-session-guide-templates";

describe("getDefaultFeedbackSessionGuide", () => {
  it("builds junior Initial ACA guide aligned to AF Form 931 / AFI 36-2406", () => {
    const guide = getDefaultFeedbackSessionGuide("initial", "TSgt");
    expect(getFeedbackGuideFormLabel("TSgt")).toBe("AF Form 931");
    expect(guide).toContain("Initial ACA — Session Guide (AF Form 931)");
    expect(guide).toContain("within 60 days");
    expect(guide).toContain("critical role in support of the mission");
    expect(guide).toContain("Knowing your Airman (Section IX)");
    expect(guide).toContain("self-assessment");
    expect(guide).toContain("Task Knowledge/Proficiency");
    expect(guide).not.toContain("Check-in cadence");
    expect(guide).not.toContain("Mission Accomplishment");
  });

  it("builds senior Initial template with Form 932 Knowing Your Airman section", () => {
    const guide = getDefaultFeedbackSessionGuide("initial", "MSgt");
    expect(getFeedbackGuideFormLabel("MSgt")).toBe("AF Form 932");
    expect(guide).toContain("AF Form 932");
    expect(guide).toContain("Knowing your Airman (Section VIII)");
    expect(guide).toContain("Mission Accomplishment");
    expect(guide).toContain("Mentorship");
    expect(guide).not.toContain("Task Knowledge/Proficiency");
  });

  it("builds Midterm template with AFI midterm ACA framing", () => {
    const guide = getDefaultFeedbackSessionGuide("midterm", "SSgt");
    expect(guide).toContain("Midterm ACA — Session Guide");
    expect(guide).toContain("projected EPR/EPB closeout");
    expect(guide).toContain("Performance assessment");
    expect(guide).toContain("Progress vs Initial expectations");
    expect(guide).toContain("Individual readiness");
    expect(guide).toContain("Knowing your Airman (Section IX)");
    expect(guide).toContain("Path to a stronger EPB package");
    expect(guide).toContain("Tentative rating focus (evidence comes from Generate)");
    expect(guide).toContain("Form-prep settings only");
    expect(guide).not.toContain("Revise can ground talking points");
    expect(guide).not.toContain("Check-in cadence");
  });

  it("builds Final template as end-of-reporting-period ACA settings", () => {
    const guide = getDefaultFeedbackSessionGuide("final", "TSgt");
    expect(guide).toContain("End-of-Reporting Period ACA");
    expect(guide).toContain("within 60 calendar days");
    expect(guide).toContain("Purpose 1 — Review the reporting period");
    expect(guide).toContain("Purpose 2 — Expectations for the new reporting period");
    expect(guide).toContain("Performance closeout by ACA area");
    expect(guide).toContain("Closeout focus (from EPB themes via Generate)");
    expect(guide).toContain("Strongest EPB statements to acknowledge");
    expect(guide).toContain("Package highlights");
    expect(guide).toContain("Knowing your Airman (Section IX)");
    expect(guide).toContain("Form-prep settings only");
    expect(guide).toContain("marries the EPB package");
    expect(guide).not.toContain("Revise can ground in EPB");
    expect(guide).not.toContain("Check-in cadence");
  });

  it("falls back to junior template when rank is null", () => {
    const guide = getDefaultFeedbackSessionGuide("initial", null);
    expect(guide).toContain("AF Form 931");
    expect(guide).toContain("Section IX");
  });
});
