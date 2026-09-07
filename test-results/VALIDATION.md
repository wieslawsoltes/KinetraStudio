# Kinetra Studio 0.1.0 — initial validation

## Completed in the supplied baseline

- 29/29 Node kernel tests passed.
- 27/27 Chromium browser interaction checks passed.
- No JavaScript errors or graphics API errors on the exercised WebGL2 path.
- All JavaScript source files passed `node --check`.
- Standalone build exercised directly; actual workspace and graph screenshots recorded.
- PNG capture contained 323861 bytes of rendered image data in that run.

## Environment and outstanding validation

Initial browser tests ran using Chromium / ANGLE SwiftShader on Linux with Xvfb, using an opaque offline document because secure-origin navigation was unavailable. The application selected its WebGL2 fallback. Native WebGPU, hardware GPU timing, persistent local storage, and cross-browser behavior were not runtime-validated. This is not a large-scene benchmark or production certification.

The initial fixed 250 ms playback assertion was timing-dependent under software rendering; the final harness waits for observable frame advancement instead. Final baseline reports were regenerated after the last source edits.

## Deployment validation

The Pages workflow reruns all 29 kernel tests and the 27-check offline browser suite. It publishes fresh reports and screenshots with the deployed application; image sizes and timing values may differ from the baseline. Generated results are retained as workflow artifacts, not committed source files.

See [kernel results](https://wieslawsoltes.github.io/KinetraStudio/test-results/kernel-report.txt), [browser results](https://wieslawsoltes.github.io/KinetraStudio/test-results/browser-report.json), and [build metadata](https://wieslawsoltes.github.io/KinetraStudio/build-info.json) for the deployed build. The post-deployment HTTP check verifies source commit and public HTML SHA-256, not native WebGPU behavior.
