# Next

Updated: 2026-11-22

## Where it stands

This is a fork of [googlecreativelab/teachablemachine-community](https://github.com/googlecreativelab/teachablemachine-community), Google's example code for Teachable Machine. This copy adds one thing, two commits ahead of the parent: `mobile/`, a phone-friendly recreation of the image workflow (collect samples with the camera, train on the device, try live predictions, export a TensorFlow.js model with code examples), live at https://teachable-machine-mobile.vercel.app, which answers. Nothing has changed since 25 September 2026.

## Next step

Open the live app in Chrome on a phone and run the whole workflow once (two classes, record samples, train, predict, export the model ZIP and load it in the example page), and note anything that breaks. It has not been touched since it was built, so a fresh run shows whether it still works before it is used again.

## After that

- Pull in the parent's changes when they matter; the fork is not behind today.
- Items the mobile README lists as outside this version: audio and pose models, TensorFlow Lite, hosted model links.

## Blocked or waiting

- None.

## Open questions

- Is the mobile app finished for its purpose, or is more planned for it?
- This plan was drafted by Claude on 2026-11-22 from the code and its history. Is the next step right?
