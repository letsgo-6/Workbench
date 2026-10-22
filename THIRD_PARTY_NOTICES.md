# Third-party notices

## Background film in the Windows package

The v0.5.0 Windows installer contains a user-provided, silent version of **Wake up** (Steam Workshop item 1781466079). Supplied metadata credits the original art to **韩一杰** (hanyijie.lofter.com / 微博 @韩一杰). This film and its still frames retain their separate copyright; the application MIT license does not grant rights to these media. The original/derived film files are not part of the source repository. README screenshots are real application captures with demonstration data. See [media notes](public/scene-media/README.md).

## v0.3.0 material storage dependencies

- `sha2 0.11.1` (RustCrypto): MIT OR Apache-2.0, used for streaming asset hashes and conditional default-template upgrades. [Upstream source and licenses](https://github.com/RustCrypto/hashes/tree/master/sha2).
- `zip 9.0.5`: MIT, default features disabled, deflate enabled; used for portable `.wbbackup` archives. [Upstream source and license](https://github.com/zip-rs/zip2).
- Tauri's existing `protocol-asset` feature exposes only the current application's assets directory to its WebView. No new frontend package or rendering library was added.

The privately supplied reference media/source are not distributed in this repository or copied into the application bundle; selected analysis documents retain the attribution context. The v0.4.0 neuron renderer is original procedural Canvas 2D code. It adds no runtime rendering dependency or media asset. The supplied orb/jellyfish media and source references were studied only: their current PolyForm Noncommercial terms and historical MIT mention do not establish per-file redistributability. They are not copied into the application bundle. Original notices remain with the user-supplied research files; see docs/design-refs/neuron/ANALYSIS.md.

## shadcn/ui

Generated UI component source in `src/components/ui/` is based on [shadcn/ui](https://github.com/shadcn-ui/ui). Its MIT license is reproduced below. Package dependencies retain their respective licenses.

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
