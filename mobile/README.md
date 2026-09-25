# Teachable Machine Mobile

A phone-friendly, independent recreation of the Teachable Machine image workflow.
Samples and trained models stay in IndexedDB on the current device. There is no
sample upload service or cloud training. A project backup contains the original
224px square samples; a separate model ZIP contains the TensorFlow.js topology,
weights, and metadata for reuse.

## Run

Use Node 22.13 or newer, then `npm ci` and `npm run dev`. Open the printed URL on
the development computer. Phone camera access requires HTTPS; a plain HTTP LAN
address will not work. Open a deployed HTTPS URL in Chrome on the phone.

## Vercel

Live app: https://teachable-machine-mobile.vercel.app

The Vercel project `aroughidea/teachable-machine-mobile` is connected to
`tj60647/teachablemachine-community` on GitHub, with `mobile` as its Root
Directory and `master` as its Production Branch. Push or merge changes to
`master` to deploy production automatically after a successful build. Other
branches receive preview deployments.

`vercel.json` selects `npm run build:vercel` and serves the static export in
`dist/client`. This deployment needs no backend,
database, API keys, or sample uploads. The bundled MobileNet files are served
with the app. Existing Sites builds still use `npm run build`.

Vercel's build environment sets the site's social-image URL. Deployment uses
Vercel's GitHub integration, so GitHub Actions deployment secrets are unnecessary.

Browser storage belongs to each website address. To move samples from the Sites
URL to the Vercel URL, save a project backup on the old URL and open that backup
on the new URL. Export/import the trained model ZIP separately if needed.

## Workflow

Rename classes, hold Camera's record button or upload images, then Train Model.
At least 5 samples per class are required; 20–50 varied examples are suggested.
This version allows 2–8 classes and 200 samples per class. MobileNet v1 0.25 is
bundled with the app. TensorFlow.js 4.22 extracts pooled features and trains only
the classifier head. Keep the tab open during training. The app requests a screen
wake lock when available. Camera streams stop on backgrounding and reconnect on
return. No app installation is required.

The project menu provides local project backup/restore, new project, and import
of standard Teachable Machine TensorFlow.js image-model ZIPs. Audio, pose,
TensorFlow Lite, and cloud training are outside this version's scope.

**Export Model** opens a download panel with the standard three-file
TensorFlow.js ZIP, JavaScript and p5.js snippets, and downloadable HTML examples.
Extract the ZIP into `my_model/` next to the example `index.html`, then serve that
directory over HTTPS (or localhost on a computer). Opening the HTML directly
as a file does not load the model. Examples load their libraries from a CDN.
Model export is separate from the mobile app's JSON project backup. Hosted model
links and TensorFlow/TensorFlow Lite conversion are not implemented.

## Checks

`npm run typecheck`, `npm test`, and `npm run build:vercel` (or `npm run build`
for Sites).
Tests cover project validation and IndexedDB persistence, actual MobileNet
feature extraction/training, prediction, archive round trips, cancellation, and
tensor disposal. Automated checks do not replace an actual Galaxy camera test.

## Attribution

Inspired by https://teachablemachine.withgoogle.com/ and the Apache-2.0 community
repository. This is an independent adaptation, not Google's hosted interface.
The original UI source is not included in the community repository. The mobile
layout is rebuilt from its public visual reference. MobileNet attribution is in
`public/models/NOTICE.txt`.
