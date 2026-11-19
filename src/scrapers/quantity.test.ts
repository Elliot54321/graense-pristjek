/** Run: npx tsx --test src/scrapers/quantity.test.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isCapacity, listingPieces, pieceCount, quantityFromName, sizeRange } from "./quantity";

test("pieceCount reads counts from real names", () => {
  const cases: [string, number | null][] = [
    ["Finish Power All in 1 Opvasketabs 70 stk.", 70],
    ["JT Affaldssæk 50L 20styk", 20],
    ["Nescafe Dolce Gusto 4x56stk", 224],
    ["Lambi Toiletpapir 6 x 8 ruller", 48],
    ["Omo Pro Formula Active Clean 3-i-1 vaskemiddel 80 kapsler 145 g", 80],
    ["At Home Clean All-in-1 tabletter til opvaskemaskine 90tabs", 90],
    ["Omo Unilever vaskepulver farvet 70 vaske 4900 g", 70],
    ["OMO Professional Color 130WL 8,4kg", 130],
    ["Omo Liquid White 71 vasker", 71],
    ["Persil Universal Gel 40 Wäschen", 40],
    ["Ariel Color 30 Waschladungen", 30],
    ["Dolce Gusto Cappuccino 16 kapsel", 16],
    ["Lambi Køkkenrulle 1 rulle", 1],
    ["Pampers Premium Protection 52 Windeln", 52],
    ["Lipton te 25 brev", 25],
    ["Toms Skildpadder 3 stykker", 3],
    ["Gillette Fusion 8 klinger", 8],
    ["Gillette Mach3 12klinger", 12],
    ["Gillette Venus 3Klinger 4styk", 4],
    ["Longo Vital 50+ 180 stk.", 180],
    ["Gillette Venus 10x Klingen Smooth XL", 10],
    ["Oral-B Cross Action 8+2 børstehoveder", 10],
    ["Ariel Color 40 vaske + 5 gratis", 45],
    ["DoppelHerz Forsvar 15Brusetabletter 94,5g", 15],
    ["DoppelHerz Magnesium+Kalium Sport 15Brt.", 15],
    ["Doppelherz Melatonin 40 Gums", 40],
    ["DoppelHerz B12 Vita Intense 18 Ampuller 205g", 18],
    ["Doppelherz Melatonin fald hurtigere i søvn Direct 20portioner", 20],
    ["Doppelherz Melatonin Intense 40 minitabletter 3,7g", 40],
    ["Teekanne Kamille 20 Teebeutel", 20],
    ["ja! Komfort toiletpapir 3-lag Pakke à 10 stk.", 10],
    ["Haribo Goldbären 24x85g", 24],
    ["Mentos 3er", 3],
    ["Danæg Skrabeæg str. S/M 30 stk. Pr. stk. 1,62.", 30],
    ["Haribo Salzbrezeln 150St", 150],
    ["Haribo Balla Balla Hindbær/Brombær 150St. Box 1,125kg", 150],
    ["Ris-fix - Basmatiris i kogepose, 4 poser / 500 g.", 4],
    ["Läkerol Orginal 4 pakker 4 x 25g", 4],
    ["Stimorol Original 10-pack, 140g", 10],
    ["Mentos 8-pk. 296 g.", 8],
    ["Tempo Taschentücher 30 Beutel", 30],
    ["Pampers Feuchte Tücher 4x52 Tücher", 208],
    ["Zewa Toilettenpapier 16 Rollen", 16],
    ["Libresse Ultra Normal 16 bind", 16],
    ["Pampers Baby-Dry str. 4 44 bleer", 44],
    ["Lipton Yellow Label te 100 breve", 100],
    ["Kinder Surprise 3æg 60g", 3],
    ["JT Toiletpapir 4-lags 10ruller 200 Blade", 10],
    ["Toiletpapir 3-lags 8 roller recyclingpapir", 8],
    ["Gillette Mach3 Barberblade 8 blade", 8],
    ["JT Bagepapir 30 Ark", 30],
    ["Fryseposer 10 pk. 2, 4, 8 og 11 l. 195 stk.", 195],
    ["Coca Cola 24 x 0,33 l.", 24],
    ["Warsteiner 4x6x0,33l", 24],
    ["JT Süßstoff 1.200 Stk. 72g", 1200],
    ["Kinder Cards 5x2styk 128g", 10],
    // Unknown or unsure
    ["Always Dobbeltpakke 16-60 stk.", null],
    ["Lambi Classic Toiletpapir 6-12 rl.", null],
    ["Zapp Lightere el. Gas 1 stk. el. 300 ml.", null],
    ["Lambi Toiletpapir 3-lags", null],
    ["Pierre Ferrand Ambre 1er Cru, Cognac, 40% vol., 70 cl", null],
    ["Rammstein Sloe Gin Ltd. 1st Edition 27 % 0,7 liter", null],
    ["Coca Cola 1,5 l", null],
    ["Haribo Matador Mix 1 kg", null],
    // Weights, sizes and claims are never counts
    ["Nescafé Dolce Gusto Cafe au Lait 160g", null],
    ["Yogi Aften te 30,6g", null],
    ["Domestos Pro Formula WC-Blok 3-i-1 Citrus 35 g", null],
    ["Abena Bag 100 L Recycled 70x110 cm 10 g", null],
    ["Toffifee 4+1 125g", null],
    ["Batterilyskæde 48 LED", null],
    ["JT Køkkenruller 4x64 blad", null],
  ];
  const wrong = cases.filter(([name, want]) => pieceCount(name) !== want).map(([name, want]) => `${name}: ${pieceCount(name)}, want ${want}`);
  assert.deepEqual(wrong, []);
});

test("single items count as 1 only when nothing else is printed", () => {
  const cases: [string, number | null][] = [
    ["Domestos Pro Formula WC-Blok 3-i-1 Citrus 35 g", 1],
    ["Jollypaw Jollina Kradsetårn", 1],
    ["Jollypaw Plys kanin", 1],
    ["Plyshund 75 cm", 1],
    ["Domestos WC-Blok 3-pak", 3],
    ["Domestos WC-Blok 2 x 35 g", 2],
    ["Abena Kniv Genanvendelig 50 g", null],
    ["LEGO, Disney, Peter Plys", null],
    ["Stitch, plys-penalhus", null],
    ["ja! Affaldsposer 50 liter", null],
  ];
  const wrong = cases.filter(([name, want]) => listingPieces(name, null) !== want).map(([name, want]) => `${name}: ${listingPieces(name, null)}, want ${want}`);
  assert.deepEqual(wrong, []);
});

test("bag capacity is not content", () => {
  assert.equal(isCapacity("JT Affaldssæk 50L 20styk"), true);
  assert.equal(isCapacity("JT fryseposer ZIP 75er 3l"), true);
  assert.equal(isCapacity("Torres Coronas Tempranillo (Bag-in-Box), 3L"), false);
  assert.equal(isCapacity("Zimmermann Graeff & Müller Grüner Veltliner"), false);
  assert.equal(isCapacity("Swirl Müllbeutel 35 l 20 Stück"), true);
  assert.equal(quantityFromName("JT Affaldssæk 50L 20styk"), null);
  assert.deepEqual(quantityFromName("Ruby Zin 3L, Bag-in-Box"), { amount: 3, unit: "l" });
});

test("sizeRange still reads newsletter ranges", () => {
  assert.deepEqual(sizeRange("0,7-1 l. 16-30%"), { min: 0.7, max: 1, unit: "l" });
});
