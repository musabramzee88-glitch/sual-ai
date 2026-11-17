import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { listBranches, listGrades, listStages, listTracks } from "./curriculum";

// اختبار تكامل على قاعدة البيانات المزروعة (npm run db:seed)
afterAll(() => db.$disconnect());

const codes = (rows: { code: string }[]) => rows.map((r) => r.code);

describe("curriculum (integration)", () => {
  it("has the three Iraqi stages in order", async () => {
    const stages = await listStages();
    expect(codes(stages)).toEqual(["PRIMARY", "INTERMEDIATE", "PREPARATORY"]);
    expect(stages.map((s) => s._count.grades)).toEqual([6, 3, 3]);
  });
  it("returns exactly three grades for the intermediate stage", async () => {
    expect(codes(await listGrades("INTERMEDIATE"))).toEqual(["INT_1", "INT_2", "INT_3"]);
  });
  it("never leaks grades across stages", async () => {
    expect(codes(await listGrades("PREPARATORY"))).toEqual(["PREP_4", "PREP_5", "PREP_6"]);
    expect(await listGrades("UNKNOWN")).toEqual([]);
  });
  it("restricts the gifted track to intermediate and preparatory", async () => {
    expect(await listGrades("PRIMARY", "GIFTED")).toEqual([]);
    expect(codes(await listGrades("INTERMEDIATE", "GIFTED"))).toHaveLength(3);
    expect(codes(await listGrades("PRIMARY", "INTERNATIONAL"))).toHaveLength(6);
  });
  it("offers all three tracks for secondary grades and two for primary", async () => {
    expect(codes(await listTracks("INT_1"))).toEqual(["GENERAL", "GIFTED", "INTERNATIONAL"]);
    expect(codes(await listTracks("PRI_3"))).toEqual(["GENERAL", "INTERNATIONAL"]);
  });
  it("maps preparatory branches", async () => {
    expect(codes(await listBranches("PREP_4"))).toEqual(["SCIENTIFIC", "LITERARY"]);
    expect(codes(await listBranches("PREP_6"))).toEqual(["APPLIED", "BIOLOGICAL", "LITERARY"]);
    expect(await listBranches("INT_2")).toEqual([]);
  });
});
