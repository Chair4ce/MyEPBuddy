# Credits & Attributions

This project incorporates code and techniques from the following open-source projects. We are deeply grateful to all the developers who contribute to the Air Force community.

---

## pdf-bullets

**Repository:** https://github.com/AF-VCD/pdf-bullets

**Author:** [ckhordiasma](https://github.com/ckhordiasma) and contributors

**License:** MIT

### What We Use

The bullet fitting and text optimization features in MyEPBuddy's Award Statement Generator are based on techniques from the pdf-bullets project. This includes:

- **Character Width Calculations:** Pre-measured pixel widths for Times New Roman 12pt font to accurately predict how text will render on AF forms.

- **Space Optimization Algorithm:** Using Unicode thin/medium space characters (`\u2006` and `\u2004`) to compress or expand text to fit within form line constraints.

- **Adobe Line Breaking Logic:** Replicating how Adobe PDF forms break lines to ensure accurate predictions.

- **Form Dimension Data:** Accurate measurements for AF Form 1206, 707, 910, and 911.

### Why This Matters

The pdf-bullets project has saved countless hours for Air Force personnel writing bullets for EPRs, OPRs, and Awards. By creating a web-based tool that accurately simulates PDF form rendering, ckhordiasma has made a significant contribution to the Air Force community.

### Our Commitment

We commit to:
- Maintaining proper attribution in our codebase and UI
- Linking back to the original project
- Respecting the MIT license terms
- Encouraging users to also check out the original pdf-bullets tool

---

## Thank You

To all open-source contributors who make tools for the military community: **thank you**. Your work matters.

If you're interested in contributing to projects that help Airmen, check out:
- [pdf-bullets](https://github.com/AF-VCD/pdf-bullets) - Bullet shaping tool
- [Air Force VCD](https://github.com/AF-VCD) - Air Force Virtual Collaboration & Development

---

*Last updated: December 2024*

